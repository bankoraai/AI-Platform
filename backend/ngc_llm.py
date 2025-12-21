import os
import hashlib
import time
import requests
import json
import re
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv
import glob
from pathlib import Path
from llama_index import VectorStoreIndex, SimpleDirectoryReader, ServiceContext, StorageContext, load_index_from_storage
from llama_index.embeddings import HuggingFaceEmbedding
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

class NGCClient:
    # Maximum number of tokens allowed by the model
    MAX_TOKENS = 131072

    def __init__(self, api_key: str = None):
        """Initialize NGC client with API key.
        
        For NVIDIA employees:
        1. Log into NGC using your NVIDIA SSO credentials
        2. Go to https://catalog.ngc.nvidia.com/settings/api-key
        3. Generate an API key
        4. Set it as NGC_API_KEY environment variable or pass it here
        """
        self.api_key = api_key or os.getenv("NGC_API_KEY")
        if not self.api_key:
            raise ValueError(
                "NGC API key is required. As an NVIDIA employee:\n"
                "1. Log into NGC using your NVIDIA SSO\n"
                "2. Go to https://catalog.ngc.nvidia.com/settings/api-key\n"
                "3. Generate an API key\n"
                "4. Set it as NGC_API_KEY environment variable or pass it to the constructor"
            )
        
        self.base_url = "https://integrate.api.nvidia.com/v1/chat/completions"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        # Initialize context storage - now supporting multiple contexts
        self.repo_context: Optional[str] = None
        self.automation_contexts: Dict[str, str] = {}  # Multiple automation contexts
        self.test_plan_context: Optional[str] = None
        self.test_catalog: Optional[str] = None  # Add this line
        self.conversation_history: List[Dict[str, str]] = []
        
        # Initialize LlamaIndex components - now supporting multiple indices
        self.main_index = None
        self.automation_indices: Dict[str, Any] = {}  # Multiple automation indices
        self.main_query_engine = None
        self.automation_query_engines: Dict[str, Any] = {}  # Multiple automation query engines

    def _compute_repo_fingerprint(self, repo_path: str, required_exts: List[str], excluded_dirs: List[str], max_files: int) -> Dict[str, Any]:
        """Compute a fast fingerprint of the repository state.

        The fingerprint is based on file paths, sizes and mtimes for the selected extensions,
        excluding known heavy directories. We also include key index parameters so that
        changes to embedding model or chunking trigger a rebuild.
        """
        file_entries: List[str] = []
        for root, dirs, files in os.walk(repo_path):
            # prune excluded directories in-place for efficiency
            dirs[:] = [d for d in dirs if d not in excluded_dirs]
            for file_name in files:
                if required_exts and not any(file_name.endswith(ext) for ext in required_exts):
                    continue
                file_path = os.path.join(root, file_name)
                try:
                    stat = os.stat(file_path)
                    file_entries.append(f"{os.path.relpath(file_path, repo_path)}|{stat.st_size}|{int(stat.st_mtime)}")
                except OSError:
                    # Skip files that disappear during scan
                    continue

        # Apply max_files if set (mimic document limiting order by path)
        file_entries.sort()
        if max_files != -1 and len(file_entries) > max_files:
            file_entries = file_entries[:max_files]

        hasher = hashlib.sha256()
        for entry in file_entries:
            hasher.update(entry.encode("utf-8"))

        return {
            "algo": "v1-path-size-mtime",
            "root": os.path.abspath(repo_path),
            "count": len(file_entries),
            "sha256": hasher.hexdigest(),
        }

    def _get_persist_dir(self, repo_path: str, kind: str) -> str:
        """Return a stable on-disk directory for persisting an index.

        The directory is namespaced under backend/data/indexes and keyed by kind + repo hash.
        """
        repo_abs = os.path.abspath(repo_path)
        repo_hash = hashlib.sha1(repo_abs.encode("utf-8")).hexdigest()[:12]
        base_dir = os.path.join(os.path.dirname(__file__), "data", "indexes")
        os.makedirs(base_dir, exist_ok=True)
        return os.path.join(base_dir, f"{kind}-{repo_hash}")

    def _persist_files_exist(self, persist_dir: str) -> bool:
        """Check if persisted index files exist in the directory."""
        # LlamaIndex simple stores commonly include docstore.json; use it as sentinel
        return os.path.exists(os.path.join(persist_dir, "docstore.json"))

    def initialize_main_repository_index(self, repo_path: str = '.', max_files: int = -1):
        """Initialize the LlamaIndex with main repository content."""
        try:
            logger.info("Loading main repository documents...")

            # Updated required_exts to include more file types found in the repository
            required_exts = [
                ".py", ".js", ".jsx", ".ts", ".tsx", ".html", ".css", ".json", ".md", ".txt",
                ".cc", ".cpp", ".cxx", ".c", ".hpp", ".h", ".hh", ".hxx",  # C/C++ files
                ".cmake", ".make", ".mk",  # Build files
                ".sh", ".bash",  # Shell scripts
                ".yaml", ".yml",  # YAML files
                ".xml",  # XML files
                ".rst",  # Documentation
                ".conf", ".cfg", ".ini",  # Configuration files
                ".toml",  # TOML files
                ".lock",  # Lock files
                ".patch", ".diff"  # Patch files
            ]
            documents = SimpleDirectoryReader(
                input_dir=repo_path,
                recursive=True,
                exclude_hidden=True,
                required_exts=required_exts
            ).load_data()

            # Manually filter out excluded directories
            excluded_dirs = ['node_modules', 'venv', '__pycache__', '.git']
            filtered_documents = [
                doc for doc in documents
                if not any(excluded in doc.metadata.get('file_path', '') for excluded in excluded_dirs)
            ]

            # Apply max_files limit if specified (not -1)
            if max_files != -1 and len(filtered_documents) > max_files:
                logger.info(f"Limiting documents to {max_files} (from {len(filtered_documents)} total)")
                filtered_documents = filtered_documents[:max_files]

            logger.info(f"Successfully loaded and filtered {len(filtered_documents)} main repository documents")

            if not filtered_documents:
                logger.warning("No main repository documents found to index")
                return False

            # Additional filtering to remove problematic documents
            valid_documents = []
            for doc in filtered_documents:
                try:
                    # Check if document content is valid
                    if doc.text and len(doc.text.strip()) > 0:
                        # Remove any null bytes or problematic characters
                        cleaned_text = doc.text.replace('\x00', '').strip()
                        
                        # Remove or replace problematic characters that might cause tokenizer issues
                        cleaned_text = cleaned_text.replace('\r', '\n')  # Normalize line endings
                        cleaned_text = ''.join(char for char in cleaned_text if ord(char) < 65536)  # Remove non-BMP characters
                        
                        # More aggressive cleaning for C/C++ files
                        # Replace very long strings (like base64 encoded data) with placeholders
                        cleaned_text = re.sub(r'"[^"]{500,}"', '"<long_string>"', cleaned_text)
                        cleaned_text = re.sub(r"'[^']{500,}'", "'<long_string>'", cleaned_text)
                        
                        # Limit line length to prevent tokenizer issues
                        lines = cleaned_text.split('\n')
                        limited_lines = []
                        for line in lines:
                            if len(line) > 500:  # More conservative line length limit
                                line = line[:500] + '...'
                            limited_lines.append(line)
                        cleaned_text = '\n'.join(limited_lines)
                        
                        # Limit total document size
                        if len(cleaned_text) > 25000:  # More conservative document size limit
                            cleaned_text = cleaned_text[:25000] + '\n... (truncated)'
                        
                        if cleaned_text.strip():
                            doc.text = cleaned_text
                            valid_documents.append(doc)
                        else:
                            logger.warning(f"Skipping empty document after cleaning: {doc.metadata.get('file_path', 'unknown')}")
                    else:
                        logger.warning(f"Skipping document with no content: {doc.metadata.get('file_path', 'unknown')}")
                except Exception as e:
                    logger.warning(f"Skipping problematic document {doc.metadata.get('file_path', 'unknown')}: {e}")

            logger.info(f"After content validation: {len(valid_documents)} main repository documents")

            if not valid_documents:
                logger.warning("No valid main repository documents found to index")
                return False

            # Prepare persistence
            persist_dir = self._get_persist_dir(repo_path, kind="main")
            os.makedirs(persist_dir, exist_ok=True)
            meta_path = os.path.join(persist_dir, "index_meta.json")

            # Compute current fingerprint and index parameters
            current_fp = self._compute_repo_fingerprint(repo_path, required_exts, excluded_dirs, max_files)
            index_params = {
                "embed_model": "BAAI/bge-large-en-v1.5",
                "chunk_size": 512,
                "chunk_overlap": 50,
            }

            logger.info("Creating main repository embeddings/query context...")
            device_embed = "cpu"
            embed_model = HuggingFaceEmbedding(
                model_name=index_params["embed_model"],
                device=device_embed
            )
            service_context = ServiceContext.from_defaults(
                embed_model=embed_model,
                llm=None,
                chunk_size=index_params["chunk_size"],
                chunk_overlap=index_params["chunk_overlap"]
            )

            # Try to load from persisted storage if fingerprint matches
            loaded_from_cache = False
            try:
                if os.path.exists(meta_path) and self._persist_files_exist(persist_dir):
                    with open(meta_path, "r", encoding="utf-8") as fmeta:
                        previous_meta = json.load(fmeta)
                    if previous_meta.get("fingerprint") == current_fp and previous_meta.get("index_params") == index_params:
                        logger.info(f"Loading persisted main index from {persist_dir} (no changes detected)")
                        storage_context = StorageContext.from_defaults(persist_dir=persist_dir)
                        self.main_index = load_index_from_storage(storage_context=storage_context, service_context=service_context)
                        loaded_from_cache = True
            except Exception as e:
                logger.warning(f"Failed to load persisted main index, will rebuild: {e}")

            if not loaded_from_cache:
                logger.info("Creating main repository index (building embeddings)...")
                self.main_index = VectorStoreIndex.from_documents(
                    valid_documents,
                    service_context=service_context
                )
                # Persist to disk
                try:
                    self.main_index.storage_context.persist(persist_dir=persist_dir)
                    with open(meta_path, "w", encoding="utf-8") as fmeta:
                        json.dump({"fingerprint": current_fp, "index_params": index_params, "ts": int(time.time())}, fmeta)
                    logger.info(f"Persisted main index to {persist_dir}")
                except Exception as e:
                    logger.warning(f"Failed to persist main index: {e}")

            self.main_query_engine = self.main_index.as_query_engine(
                similarity_top_k=10,
                vector_store_query_mode="default",  # mix keyword + embedding search
                similarity_threshold=0.75
            )

            logger.info("Main repository LlamaIndex initialization complete")
            return True

        except Exception as e:
            logger.error(f"Error initializing main repository LlamaIndex: {str(e)}")
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")
            return False

    def initialize_automation_index(self, automation_path: str, max_files: int = -1):
        """Initialize the LlamaIndex with automation repository content."""
        try:
            logger.info("Loading automation documents...")

            # For automation, we only want Python files and test-related files
            required_exts = [
                ".py", ".pyx", ".pxd",  # Python files
                ".yaml", ".yml",  # YAML files
                ".json",  # JSON files
                ".md", ".txt",  # Documentation
                ".sh", ".bash",  # Shell scripts
                ".conf", ".cfg", ".ini"  # Configuration files
            ]
            documents = SimpleDirectoryReader(
                input_dir=automation_path,
                recursive=True,
                exclude_hidden=True,
                required_exts=required_exts
            ).load_data()

            # Filter out excluded directories
            excluded_dirs = ['node_modules', 'venv', '__pycache__', '.git', '.pytest_cache']
            filtered_documents = [
                doc for doc in documents
                if not any(excluded in doc.metadata.get('file_path', '') for excluded in excluded_dirs)
            ]

            # Apply max_files limit if specified (not -1)
            if max_files != -1 and len(filtered_documents) > max_files:
                logger.info(f"Limiting automation documents to {max_files} (from {len(filtered_documents)} total)")
                filtered_documents = filtered_documents[:max_files]

            logger.info(f"Successfully loaded and filtered {len(filtered_documents)} automation documents")

            if not filtered_documents:
                logger.warning("No automation documents found to index")
                return False

            # Additional filtering to remove problematic documents
            valid_documents = []
            for doc in filtered_documents:
                try:
                    # Check if document content is valid
                    if doc.text and len(doc.text.strip()) > 0:
                        # Remove any null bytes or problematic characters
                        cleaned_text = doc.text.replace('\x00', '').strip()
                        
                        # Remove or replace problematic characters that might cause tokenizer issues
                        cleaned_text = cleaned_text.replace('\r', '\n')  # Normalize line endings
                        cleaned_text = ''.join(char for char in cleaned_text if ord(char) < 65536)  # Remove non-BMP characters
                        
                        # Limit line length to prevent tokenizer issues
                        lines = cleaned_text.split('\n')
                        limited_lines = []
                        for line in lines:
                            if len(line) > 500:  # More conservative line length limit
                                line = line[:500] + '...'
                            limited_lines.append(line)
                        cleaned_text = '\n'.join(limited_lines)
                        
                        # Limit total document size
                        if len(cleaned_text) > 25000:  # More conservative document size limit
                            cleaned_text = cleaned_text[:25000] + '\n... (truncated)'
                        
                        if cleaned_text.strip():
                            doc.text = cleaned_text
                            valid_documents.append(doc)
                        else:
                            logger.warning(f"Skipping empty automation document after cleaning: {doc.metadata.get('file_path', 'unknown')}")
                    else:
                        logger.warning(f"Skipping automation document with no content: {doc.metadata.get('file_path', 'unknown')}")
                except Exception as e:
                    logger.warning(f"Skipping problematic automation document {doc.metadata.get('file_path', 'unknown')}: {e}")

            logger.info(f"After content validation: {len(valid_documents)} automation documents")

            if not valid_documents:
                logger.warning("No valid automation documents found to index")
                return False

            # Prepare persistence
            persist_dir = self._get_persist_dir(automation_path, kind="automation")
            os.makedirs(persist_dir, exist_ok=True)
            meta_path = os.path.join(persist_dir, "index_meta.json")

            index_params = {
                "embed_model": "BAAI/bge-large-en-v1.5",
                "chunk_size": 512,
                "chunk_overlap": 50,
            }

            # Build query-time embedding model
            device_embed = "cpu"
            embed_model = HuggingFaceEmbedding(
                model_name=index_params["embed_model"],
                device=device_embed
            )
            service_context = ServiceContext.from_defaults(
                embed_model=embed_model,
                llm=None,
                chunk_size=index_params["chunk_size"],
                chunk_overlap=index_params["chunk_overlap"]
            )

            # Compute fingerprint for this repo
            excluded_dirs = ['node_modules', 'venv', '__pycache__', '.git', '.pytest_cache']
            current_fp = self._compute_repo_fingerprint(automation_path, required_exts, excluded_dirs, max_files)

            # Try to load cached index
            loaded_from_cache = False
            try:
                if os.path.exists(meta_path) and self._persist_files_exist(persist_dir):
                    with open(meta_path, "r", encoding="utf-8") as fmeta:
                        previous_meta = json.load(fmeta)
                    if previous_meta.get("fingerprint") == current_fp and previous_meta.get("index_params") == index_params:
                        logger.info(f"Loading persisted automation index from {persist_dir} (no changes detected)")
                        storage_context = StorageContext.from_defaults(persist_dir=persist_dir)
                        self.automation_indices[automation_path] = load_index_from_storage(storage_context=storage_context, service_context=service_context)
                        loaded_from_cache = True
            except Exception as e:
                logger.warning(f"Failed to load persisted automation index, will rebuild: {e}")

            if not loaded_from_cache:
                logger.info("Creating automation index (building embeddings)...")
                self.automation_indices[automation_path] = VectorStoreIndex.from_documents(
                    valid_documents,
                    service_context=service_context
                )
                # Persist to disk
                try:
                    self.automation_indices[automation_path].storage_context.persist(persist_dir=persist_dir)
                    with open(meta_path, "w", encoding="utf-8") as fmeta:
                        json.dump({"fingerprint": current_fp, "index_params": index_params, "ts": int(time.time())}, fmeta)
                    logger.info(f"Persisted automation index to {persist_dir}")
                except Exception as e:
                    logger.warning(f"Failed to persist automation index: {e}")

            logger.info("Creating automation query engine...")
            self.automation_query_engines[automation_path] = self.automation_indices[automation_path].as_query_engine(
                similarity_top_k=10,
                vector_store_query_mode="default",  # mix keyword + embedding search
                similarity_threshold=0.75
            )

            logger.info("Automation LlamaIndex initialization complete")
            return True

        except Exception as e:
            logger.error(f"Error initializing automation LlamaIndex: {str(e)}")
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")
            return False

    def get_relevant_context(self, query: str, num_results: int = 3) -> str:
        """Get relevant context from the main repository using LlamaIndex."""
        if not self.main_query_engine:
            return ""
        
        try:
            response = self.main_query_engine.query("query" + query)
            return str(response)
        except Exception as e:
            print(f"Error querying main repository LlamaIndex: {e}")
            return ""

    def get_automation_context(self, query: str, repo_name: str = None) -> str:
        """Get relevant context from automation repositories using LlamaIndex."""
        if repo_name:
            # Query specific automation repository
            if repo_name in self.automation_query_engines:
                try:
                    response = self.automation_query_engines[repo_name].query("query:" + query)
                    return str(response)
                except Exception as e:
                    print(f"Error querying automation repository '{repo_name}': {e}")
                    return ""
            else:
                return ""
        else:
            # Query all automation repositories and combine results
            all_contexts = []
            for repo_name, query_engine in self.automation_query_engines.items():
                try:
                    response = query_engine.query(query)
                    context = str(response)
                    if context:
                        all_contexts.append(f"From {repo_name}: {context}")
                except Exception as e:
                    print(f"Error querying automation repository '{repo_name}': {e}")
            
            return "\n\n".join(all_contexts)

    def get_all_automation_contexts(self) -> str:
        """Get all automation contexts as a combined string with repository-specific context."""
        contexts = []
        for repo_name, context in self.automation_contexts.items():
            contexts.append(f"{repo_name.upper()} CONTEXT:\n{context}")
        return "\n\n".join(contexts)

    def _get_file_content(self, file_path: str, max_lines: int = 100) -> str:
        """Read file content with a line limit."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()[:max_lines]
                content = ''.join(lines)
                if len(lines) == max_lines:
                    content += f"\n... (truncated at {max_lines} lines)"
                return content
        except Exception as e:
            return f"Error reading file: {str(e)}"

    def _is_binary_file(self, file_path: str) -> bool:
        """Check if a file is binary."""
        try:
            with open(file_path, 'tr') as f:
                f.read(1024)
                return False
        except:
            return True

    def _should_ignore_file(self, file_path: str) -> bool:
        """Check if a file should be ignored."""
        ignore_patterns = [
            '.git', '__pycache__', '.pytest_cache', '.coverage',
            'node_modules', 'venv', '.env', '.DS_Store',
            '.pyc', '.pyo', '.pyd', '.so', '.dll', '.dylib',
            '.exe', '.bin', '.dat', '.db', '.sqlite',
            '.jpg', '.jpeg', '.png', '.gif', '.ico', '.svg',
            '.pdf', '.zip', '.tar', '.gz', '.rar',
            '.mp3', '.mp4', '.avi', '.mov', '.wmv',
            '.log', '.tmp', '.temp', '.swp'
        ]
        return any(pattern in file_path for pattern in ignore_patterns)

    def _get_file_summary(self, file_path: str) -> Dict[str, str]:
        """Get a summary of a file's content."""
        if self._is_binary_file(file_path) or self._should_ignore_file(file_path):
            return {
                'path': file_path,
                'type': 'binary/ignored',
                'content': 'Binary or ignored file'
            }

        content = self._get_file_content(file_path)
        return {
            'path': file_path,
            'type': 'text',
            'content': content
        }

    def scan_repository(self, repo_path: str = '.', max_files: int = 100) -> str:
        """Scan the repository and create a structured context.
        
        Args:
            repo_path: Path to the repository root
            max_files: Maximum number of files to include in the context (-1 for unlimited)
            
        Returns:
            A string containing the repository context
        """
        repo_path = Path(repo_path)
        if not repo_path.exists():
            raise ValueError(f"Repository path does not exist: {repo_path}")

        # Get all files in the repository
        all_files = []
        for ext in ['*.py', '*.js', '*.jsx', '*.ts', '*.tsx', '*.html', '*.css', '*.json', '*.md', '*.txt']:
            all_files.extend(glob.glob(str(repo_path / '**' / ext), recursive=True))

        # Filter and sort files
        files = [f for f in all_files if not self._should_ignore_file(f)]
        files.sort()
        
        # Apply max_files limit only if it's not unlimited (-1)
        if max_files != -1:
            files = files[:max_files]

        # Create repository context
        context_parts = [
            "Repository Structure:",
            "===================",
            f"Total files scanned: {len(files)}",
            f"Repository root: {repo_path.absolute()}",
            "\nFile Contents:",
            "============="
        ]

        for file_path in files:
            file_summary = self._get_file_summary(file_path)
            context_parts.extend([
                f"\nFile: {file_summary['path']}",
                f"Type: {file_summary['type']}",
                "Content:",
                "```",
                file_summary['content'],
                "```"
            ])

        return "\n".join(context_parts)

    def set_repository_context(self, context: str) -> None:
        """Set the repository context that will be included in all future prompts.
        
        Args:
            context: A string containing relevant repository information
        """
        self.repo_context = context

    def set_automation_context(self, context: str, repo_name: str = "default"):
        """Set the automation context for a specific repository.
        
        Args:
            context: A string containing relevant automation information
            repo_name: Name of the automation repository (e.g., 'tests', 'core')
        """
        self.automation_contexts[repo_name] = context

    def set_test_plan_context(self, context: str) -> None:
        """Set the test plan context that will be included in all future prompts.
        
        Args:
            context: A string containing relevant test plan information
        """
        self.test_plan_context = context

    def set_test_catalog(self, test_catalog: str) -> None:
        """Set the test catalog that will be included in all future prompts."""
        if not test_catalog:
            self.test_catalog = ""
            return
        
        # Limit the test catalog to prevent timeouts
        max_tests = 1000  # Start with a reasonable number
        max_line_length = 100  # Limit line length
        
        lines = test_catalog.split('\n')
        limited_lines = []
        test_count = 0
        
        for line in lines:
            # Truncate very long lines
            if len(line) > max_line_length:
                line = line[:max_line_length] + "..."
            
            if line.startswith('ALM ID:'):
                test_count += 1
                if test_count > max_tests:
                    limited_lines.append(f"\n... (showing first {max_tests} tests, {test_catalog.count('ALM ID:') - max_tests} more tests available)")
                    break
            
            limited_lines.append(line)
        
        limited_catalog = '\n'.join(limited_lines)
        self.test_catalog = limited_catalog
        
        logger.info(f"Limited test catalog to first {max_tests} tests to prevent timeout")
        logger.info(f"Original catalog had {test_catalog.count('ALM ID:')} tests")

    def clear_context(self) -> None:
        """Clear all stored context and conversation history."""
        self.repo_context = None
        self.automation_contexts = {}
        self.test_plan_context = None
        self.test_catalog = None  # Add this line
        self.conversation_history = []

    def _build_context_prompt(self) -> str:
        """Build the context portion of the prompt."""
        context_parts = []
        
        if self.repo_context:
            context_parts.append("Repository Context:")
            context_parts.append(self.repo_context)
            context_parts.append("")
            
        if self.automation_contexts:
            context_parts.append("Automation Contexts:")
            for repo_name, context in self.automation_contexts.items():
                context_parts.append(f"{repo_name.upper()} CONTEXT:")
                context_parts.append(context)
                context_parts.append("")
            
        if self.test_plan_context:
            context_parts.append("Test Plan Context:")
            context_parts.append(self.test_plan_context)
            context_parts.append("")
            
        return "\n".join(context_parts)

    def _estimate_tokens(self, text: str) -> int:
        """Rough estimate of tokens (approximately 4 characters per token)"""
        return len(text) // 4

    def _check_token_limit(self, prompt: str) -> bool:
        """Check if the prompt would exceed the token limit"""
        estimated_tokens = self._estimate_tokens(prompt)
        return estimated_tokens < self.MAX_TOKENS

    def extract_test_catalog(self, automation_path: str) -> str:
        """Extract a catalog of existing tests with their ALM IDs and descriptions."""
        try:
            import re
            import os
            
            test_catalog = []
            test_catalog.append("EXISTING TEST CATALOG:")
            test_catalog.append("=====================")
            
            # Walk through all Python files in the automation directory
            for root, dirs, files in os.walk(automation_path):
                for file in files:
                    if file.endswith('.py'):
                        file_path = os.path.join(root, file)
                        try:
                            with open(file_path, 'r', encoding='utf-8') as f:
                                content = f.read()
                                
                            # Extract testinfo decorators
                            testinfo_matches = re.findall(
                                r'@testinfo\("([^"]+)"\)',
                                content
                            )
                            
                            for match in testinfo_matches:
                                # Parse the testinfo string
                                # Format: "name:test_name;alm_id:1234; testlink:1234; owner:name; supported_os:ubuntu"
                                test_info = {}
                                for part in match.split(';'):
                                    if ':' in part:
                                        key, value = part.strip().split(':', 1)
                                        test_info[key] = value
                                
                                if 'alm_id' in test_info and 'name' in test_info:
                                    # Extract class docstring for description
                                    class_match = re.search(
                                        r'class Test\(DPLRunSuite\):\s*\n\s*"""(.*?)"""',
                                        content,
                                        re.DOTALL
                                    )
                                    description = class_match.group(1).strip() if class_match else "No description available"
                                    
                                    # Extract test methods
                                    test_methods = re.findall(
                                        r'def (test_step_\d+)\(self\):\s*\n\s*"""(.*?)"""',
                                        content,
                                        re.DOTALL
                                    )
                                    
                                    test_catalog.append(f"\nALM ID: {test_info['alm_id']}")
                                    test_catalog.append(f"Test Name: {test_info['name']}")
                                    test_catalog.append(f"Owner: {test_info.get('owner', 'Unknown')}")
                                    test_catalog.append(f"Description: {description}")
                                    
                                    if test_methods:
                                        test_catalog.append("Test Steps:")
                                        for method_name, method_desc in test_methods:
                                            test_catalog.append(f"  - {method_name}: {method_desc.strip()}")
                                    
                                    test_catalog.append("-" * 50)
                                    
                        except Exception as e:
                            logger.warning(f"Error processing file {file_path}: {e}")
                            continue
            
            return "\n".join(test_catalog)
            
        except Exception as e:
            logger.error(f"Error extracting test catalog: {e}")
            return "Error extracting test catalog"

    def _build_architecture_context(self, project_cfg: Dict) -> str:
        """Build architecture context from project configuration"""
        arch_cfg = project_cfg.get('architecture_context', {})
        test_catalog_guide = project_cfg.get('test_catalog_guide', {})
        
        context_parts = [
            "PROJECT ARCHITECTURE CONTEXT:",
            "============================",
            ""
        ]
        
        # Handle all architecture context sections dynamically
        for section_name, section_content in arch_cfg.items():
            if isinstance(section_content, list) and section_content:
                # Format section name nicely (e.g., "core_components" -> "**Core Components:**")
                formatted_name = section_name.replace('_', ' ').title()
                context_parts.append(f"**{formatted_name}:**")
                
                # Add all items in the section
                for item in section_content:
                    context_parts.append(f"   - {item}")
                context_parts.append("")
        
        # Add test catalog guide information generically
        if test_catalog_guide:
            context_parts.append("TEST CATALOG GUIDE:")
            context_parts.append("==================")
            context_parts.append("")
            
            # Handle all test catalog guide sections dynamically
            for section_name, section_content in test_catalog_guide.items():
                if isinstance(section_content, dict) and section_content:
                    # Format section name nicely
                    formatted_name = section_name.replace('_', ' ').title()
                    context_parts.append(f"**{formatted_name}:**")
                    
                    # Add all key-value pairs
                    for key, value in section_content.items():
                        context_parts.append(f"   - {key}: {value}")
                    context_parts.append("")
                
                elif isinstance(section_content, list) and section_content:
                    # Handle arrays (if any remain)
                    formatted_name = section_name.replace('_', ' ').title()
                    context_parts.append(f"**{formatted_name}:**")
                    
                    for item in section_content:
                        context_parts.append(f"   - {item}")
                    context_parts.append("")
                
                elif isinstance(section_content, str) and section_content:
                    # Handle string values (like search_instructions)
                    formatted_name = section_name.replace('_', ' ').title()
                    context_parts.append(f"**{formatted_name}:**")
                    context_parts.append(f"   {section_content}")
                    context_parts.append("")
        
        return "\n".join(context_parts)

    def analyze_commit(self, commit_message: str, code_changes: str, project_name: str = None, model: str = None, plan_mode: Optional[str] = None) -> Dict[str, Any]:
        """
        Analyze a commit message and code changes using NGC's LLM service.
        
        Args:
            commit_message: The commit message to analyze
            code_changes: The code changes (diff) to analyze
            project_name: Name of the project (if None, will use default from config)
            model: Model to use for analysis
        """
        # Get project configuration
        project_cfg = get_project_config(project_name)
        if not project_cfg:
            raise ValueError(f"No configuration found for project: {project_name}")
        
        # Extract keywords from the diff to create a more targeted query
        changed_files = re.findall(r'diff --git a/(.+) b/', code_changes)
        functions_and_classes = re.findall(
            r'^\+[^\w]*?(?:class|struct|void|int|std::string|doca_error_t)\s+([a-zA-Z_]\w*)',
            code_changes,
            re.MULTILINE
        )

        file_keywords = [Path(f).name for f in changed_files]
        extracted_keywords = list(set(file_keywords + functions_and_classes))
        
        refined_query = " ".join(extracted_keywords)
        if not refined_query:
            refined_query = commit_message # Fallback to commit message if no keywords found
        
        # Get relevant context from main repository using the refined query
        logger.info(f"Querying main repository index with refined query: '{refined_query}'")
        relevant_context = self.get_relevant_context(refined_query)
        logger.info(f"Retrieved context from main repository index:\n---\n{relevant_context}\n---")
        
        # Get relevant context from automation repository
        logger.info(f"Querying automation index with refined query: '{refined_query}'")
        automation_context = self.get_automation_context(refined_query)
        logger.info(f"Retrieved context from automation index:\n---\n{automation_context}\n---")
        
        # Test catalog is now already extracted and stored during initialization
        # No need to extract it again here
        
        # Build architecture context from project config
        architecture_context = self._build_architecture_context(project_cfg)
        
        # Build context prompt with project-specific architecture
        context_prompt = ""
        if relevant_context:
            context_prompt += f"\nRelevant Repository Context:\n{relevant_context}\n"
        if automation_context:
            context_prompt += f"\nRelevant Automation Context:\n{automation_context}\n"
        context_prompt += f"\n{architecture_context}\n"
        
        # Get the stored test catalog from initialization
        test_catalog_context = ""
        if self.test_catalog:
            test_catalog_context = f"\n{self.test_catalog}\n"
            logger.info(f"Using stored test catalog with {self.test_catalog.count('ALM ID:')} tests")
        else:
            logger.warning("No test catalog available - was initialization completed?")
        
        # Enhanced prompt with project-specific architecture and test catalog
        prompt = f"""
        This is the context from the repositories and the test catalog:
        {context_prompt}
        {test_catalog_context}

        The commit message and code changes:
        Commit message:
        {commit_message}

        Code changes:
        {code_changes}
        Analyze according to the system's instructions.
        """
        
        # Use the specified model or default to DeepSeek R1 for stronger reasoning
        model_name = model or "deepseek-ai/deepseek-r1"
        
        # Build plan-specific instructions based on plan_mode
        mode = (plan_mode or '').strip().lower()
        is_qa = (mode == 'qa')
        is_verif = (mode == 'verification')
        plan_header = "Functional QA Test Plan" if is_qa or not is_verif else "Functional Verification Test Plan"
        plan_focus = (
            "- This section must focus on **black-box functional testing** from a QA Engineer's perspective.\n"
            "- Describe a high-level test plan to validate the new or changed functionality.\n"
            "- For each major functional area affected by the commit, propose specific test scenarios.\n"
        ) if is_qa or not is_verif else (
            "- This section must focus on **unit-level verification per module changed in this commit**.\n"
            "- For each changed module/file in the diff, enumerate the impacted functions/classes and create unit test cases.\n"
            "- For each unit test case include: objective, inputs, setup/mocks/stubs, execution, and precise assertions.\n"
            "- Cover positive, negative, boundary and error-handling paths; include edge cases and invariants.\n"
            "- Indicate any dependencies to mock (I/O, network, time, randomness, environment).\n"
            "- Prefer concise, isolated tests; where useful, add small integration tests limited to the module and its immediate collaborators.\n"
        )
        plan_expected_ref = "Functional QA Test Plan" if is_qa or not is_verif else "Functional Verification Test Plan"

        # Prepare messages for chat completion with plan-specific instructions
        messages = [
            {"role": "system", 
             "content": f"""
                Analyze ONLY the commit the user inputs. Do not provide general project analysis or overview.
                Focus specifically on the changes in this commit and their impact.

        **IMPORTANT SYSTEM CONTEXT:** {project_cfg.get('system_context', '')}

        Pay close attention to the Markdown format with the following guidelines (strictly follow):
        - Use # for main headers (h1)
        - Use ## for section headers (h2) 
        - Use ### for subsections (h3)
        - Use * or - for bullet points (without extra bold) and ALWAYS use bullet points for any list of steps
        - Use > for important notes or quotes
        - Use `code` for technical terms
        - Use *italic* for emphasis
        - Only use **bold** for truly important highlights

        Format your response in exactly three sections and using the Markdown format:

        # Commit Meaning
        - What specific problem does this commit solve?
        - What are the key technical changes made?
        - What is the impact on the system's behavior?

        # {plan_header}
        {plan_focus}
        - Consider adding onto existing tests if applicable.
        - For each test scenario, describe:
          * **Objective:** What is the goal of this test? What specific user-facing or system-level behavior are we validating?
          * **Test Steps:** Provide 6-8 detailed, sequential steps as BULLET POINTS that include:
            - Setup/preparation steps
            - Configuration steps  
            - Execution steps
            - Validation steps
            - Cleanup steps
            - Each step MUST be a concise bullet point and actionable
            Include relevant OVS CLI commands from the architecture context when describing test steps. Prefer realistic command sequences over abstract placeholders.
            **If no existing automation test matches a commit’s changed feature, mark as ‘No existing coverage’ and recommend adding a new test.**
          * **Expected Behavior:** What is the expected outcome (assertions and observable state/return values)?

        # Recommended Test Plan For This Commit
        Create a comprehensive test plan table that combines:
        1. **New functional tests** from the "{plan_header}" section above
        2. **Existing automation tests** which follow the guidelines below:
        - **CRITICAL:** Review the existing test catalog above and identify which existing tests should be run.
        - **SYSTEM RELATIONSHIPS:** Remember the system relationships defined in the architecture context.
        - For each recommended test, specify:
          * **ALM ID:** The exact ALM test ID (e.g., "7420", "7427")
          * **Test Name:** The name of the existing test
          * **Reason:** Why this existing test is relevant to the changes in this commit
          * **Expected Coverage:** What aspect of the changes this test will validate
        - **Think broadly about system relationships:** Any change to one component may impact related components
        - Consider both positive testing (verifying new functionality works) and regression testing (ensuring existing functionality still works)

                Use this exact table format:
                | Test Type | Test Name/ID | Objective | Quality Category | Reason | Expected Result | Priority (0-10) |
                |-----------|--------------|-----------|------------------|--------|-----------------|-----------------|
                | New Functional | [Test Name] | [Objective from {plan_expected_ref}] | [One or more: Features/Functionality; Backward compatibility; Configuration/Setup; Installation/Upgrade; Interoperability; Logging & debugability; Performance; Reliability; Scale; Bad Flow] | [Reason for adding this test] | [Expected from {plan_expected_ref}] | Rating between 0 to 10 where 0 is the highest priority |
                | Existing Automation | [ALM ID] - [Test Name] | [Objective from Recommended Tests] | [One or more categories as above] | [Reason for adding this test] | [Expected from Recommended Tests] | Rating between 0 to 10 where 0 is the highest priority |

                **Guidelines for the Test Plan Table:**
                - **Test Type:** "New Functional" for new tests, "Existing Automation" for existing tests
                - **Test Name/ID:** For new tests use descriptive names, for existing tests use "ALM_ID - Test Name"
                - **Objective:** What specific aspect of the commit this test validates
                - **Quality Category:** Choose only the categories that apply to this commit and test. Allowed values: Features/Functionality; Backward compatibility; Configuration/Setup; Installation/Upgrade; Interoperability; Logging & debugability; Performance; Reliability; Scale; Bad Flow. Prefer 1–2 categories; use comma-separated values if multiple.
                - **Test Steps:** Concise steps to execute the test
                - **Expected Result:** What should happen when the test passes
                - **Priority:** Priority 0: Core packet processing changes, high risk of outage
                Priority 1: Feature logic changes with wide deployment impact
                Priority 2: Performance, scaling, or multi-component dependencies
                Priority 3–6: Feature-specific, localized changes
                Priority 7–10: Low-risk, cosmetic, logging-only changes
                Where:
                - Start with **High Priority** tests and mark them as such in the table.
                - Run **Existing Automation** tests first (regression testing)
                - Then run **New Functional** tests (feature validation)
                """},
            {"role": "user", "content": prompt}
        ]

        # Guard rail: if combined tokens are too high, trim user content
        try:
            est = self._estimate_tokens(messages[0]["content"]) + self._estimate_tokens(messages[1]["content"]) + 3000
            if est >= self.MAX_TOKENS:
                user_text = messages[1]["content"]
                keep_chars = int(len(user_text) * 0.7)
                messages[1]["content"] = user_text[:max(4000, keep_chars)]
        except Exception:
            pass

        # Call chat_completion with retries; fallback with more trimming if needed
        result: Dict[str, Any]
        try:
            result = self.chat_completion(messages=messages, max_tokens=2800, temperature=0.6, retries=2, timeout_seconds=600, model_name=model_name)
        except Exception as e:
            logger.error(f"Primary analyze_commit call failed, retrying with trimmed prompt and default model: {e}")
            try:
                user_text = messages[1]["content"]
                messages[1]["content"] = user_text[: int(len(user_text) * 0.7)]
            except Exception:
                pass
            result = self.chat_completion(messages=messages, max_tokens=2000, temperature=0.6, retries=1, timeout_seconds=600)

        if "choices" not in result:
            logger.error(f"Unexpected NGC response structure: {result}")
            raise ValueError(f"NGC API returned unexpected response structure: {result}")

        response_content = result["choices"][0]["message"]["content"]

        usage = result.get("usage", {})
        if usage:
            logger.info(
                f"Token usage - Prompt: {usage.get('prompt_tokens', 0)}, Completion: {usage.get('completion_tokens', 0)}, Total: {usage.get('total_tokens', 0)}"
            )

        parsed_new_tests = self._parse_new_functional_tests(response_content)
        functional_plan_text = self._extract_functional_plan_section(response_content)

        return {
            "analysis": response_content,
            "model": result.get("model", model_name),
            "usage": usage,
            "project_name": project_name,
            "new_functional_tests": parsed_new_tests,
            "functional_plan": functional_plan_text,
        }

    def chat_completion(self, messages: List[Dict[str, str]], max_tokens: int = 4000, temperature: float = 0.1, retries: int = 2, timeout_seconds: int = 600, model_name: Optional[str] = None) -> Dict[str, Any]:
        """Generate chat completion using NGC API
        
        Args:
            messages: List of message dictionaries with 'role' and 'content'
            max_tokens: Maximum number of tokens to generate
            temperature: Sampling temperature (0.0 = deterministic, 1.0 = creative)
            
        Returns:
            Dictionary with 'choices' containing the generated response
        """
        try:
            # Default to MiniMax M2 unless overridden by caller
            model_name = model_name or "minimaxai/minimax-m2"

            attempt = 0
            last_exc: Optional[Exception] = None
            cur_messages = messages
            cur_max_tokens = min(max_tokens, self.MAX_TOKENS)

            while attempt <= max(0, retries):
                try:
                    payload = {
                        "model": model_name,
                        "messages": cur_messages,
                        "temperature": temperature,
                        "max_tokens": cur_max_tokens,
                        "top_p": 0.95,
                        "extra_body": {"chat_template_kwargs": {"thinking":False}},
                        "stream": False,
                    }

                    logger.info(f"Making NGC API call (attempt {attempt+1}) with {len(cur_messages)} messages, max_tokens={cur_max_tokens}")

                    response = requests.post(
                        self.base_url,
                        headers=self.headers,
                        json=payload,
                        timeout=timeout_seconds
                    )
                    response.raise_for_status()

                    result = response.json()

                    if "usage" in result:
                        usage = result["usage"]
                        logger.info(
                            f"Token usage - Prompt: {usage.get('prompt_tokens', 0)}, "
                            f"Completion: {usage.get('completion_tokens', 0)}, "
                            f"Total: {usage.get('total_tokens', 0)}"
                        )

                    return result
                except requests.exceptions.Timeout as te:
                    last_exc = te
                    logger.error("NGC API request timed out")
                except requests.exceptions.RequestException as rexc:
                    last_exc = rexc
                    logger.error(f"Error making request to NGC: {str(rexc)}")
                    if hasattr(rexc, 'response') and hasattr(rexc.response, 'text'):
                        logger.error(f"Response: {rexc.response.text}")
                except Exception as ex:
                    last_exc = ex
                    logger.error(f"Unexpected error in chat_completion: {str(ex)}")

                # If we have more attempts, reduce payload size: lower max_tokens and trim user content
                attempt += 1
                if attempt <= max(0, retries):
                    cur_max_tokens = max(1000, int(cur_max_tokens * 0.75))
                    # Trim the last user message content if present
                    try:
                        trimmed = []
                        for m in cur_messages:
                            if m.get('role') == 'user' and isinstance(m.get('content'), str) and len(m['content']) > 20000:
                                new_len = int(len(m['content']) * 0.75)
                                trimmed.append({**m, 'content': m['content'][:new_len]})
                            else:
                                trimmed.append(m)
                        cur_messages = trimmed
                    except Exception:
                        pass

            # Exhausted retries
            if last_exc:
                raise last_exc
            raise RuntimeError("NGC chat_completion failed without exception")
        except Exception:
            raise

    def chat_completion_stream(self, messages: List[Dict[str, str]], max_tokens: int = 4000, temperature: float = 0.1, timeout_seconds: int = 600, model_name: Optional[str] = None):
        """Stream chat completion tokens using NGC API (SSE).
        
        Yields dict events: { 'type': 'delta', 'content': '...' } and a final { 'type': 'done' }.
        """
        # Default to DeepSeek R1 for reasoning-style output
        model = model_name or "deepseek-ai/deepseek-r1"
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": min(max_tokens, self.MAX_TOKENS),
            "top_p": 0.95,
            "stream": True,
        }
        logger.info(f"Starting NGC streaming completion with model={model}, max_tokens={payload['max_tokens']}")
        with requests.post(self.base_url, headers=self.headers, json=payload, timeout=timeout_seconds, stream=True) as resp:
            resp.raise_for_status()
            buffer = b""
            for chunk in resp.iter_content(chunk_size=None):
                if not chunk:
                    continue
                buffer += chunk
                # Split by SSE event boundaries
                while b"\n\n" in buffer:
                    raw_event, buffer = buffer.split(b"\n\n", 1)
                    try:
                        # SSE lines usually begin with "data: "
                        lines = raw_event.splitlines()
                        data_lines = [ln[6:] for ln in lines if ln.startswith(b"data: ")]
                        if not data_lines:
                            continue
                        data = b"".join(data_lines).decode("utf-8", "ignore").strip()
                        if not data or data == "[DONE]":
                            yield {"type": "done"}
                            return
                        evt = json.loads(data)
                        # OpenAI-style delta format
                        choices = evt.get("choices") or []
                        if choices:
                            delta = choices[0].get("delta") or {}
                            content_piece = delta.get("content")
                            if content_piece:
                                yield {"type": "delta", "content": content_piece}
                    except Exception as e:
                        logger.debug(f"Failed to parse SSE event: {e}")
                        continue
            # If stream ends without explicit [DONE]
            yield {"type": "done"}

    def _read_dpl_target_arch_doc(self, max_chars: int = 20000) -> str:
        """Read the DPL target architecture HTML doc from data/confluence if present."""
        try:
            base_dir = os.path.dirname(__file__)
            doc_path = os.path.join(base_dir, 'data', 'confluence', 'dpl_target_arch.html')
            if not os.path.exists(doc_path):
                return ''
            with open(doc_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            # Truncate to avoid oversized prompts
            return content[:max_chars]
        except Exception:
            return ''

    def generate_p4_sample(self, test_name: str, test_objective: str, p4_target: str = 'dpl', commit_context: str = '', project_name: Optional[str] = None) -> Dict[str, Any]:
        """Generate a minimal P4 sample program aligned to a suggested test.

        Args:
            test_name: Name of the test
            test_objective: High-level objective from the test plan
            p4_target: Target architecture (e.g., 'dpl'/'v1model'/'psa'/'dpdk')
            commit_context: Optional analysis/functional plan context
        Returns:
            Dict with generated p4 code and metadata
        """
        try:
            # Build context
            context_parts: List[str] = []
            if self.repo_context:
                context_parts.append(f"Repo Context (truncated):\n{self.repo_context[:2000]}...")
            arch_doc = self._read_dpl_target_arch_doc()
            if arch_doc:
                context_parts.append(f"DPL Target Architecture (HTML excerpt):\n{arch_doc[:8000]}...")
            # Add a canonical P4 sample from reference repos if configured
            if project_name:
                try:
                    project_cfg = get_project_config(project_name)
                    if project_cfg:
                        sample_rel = project_cfg.get('p4_generation', {}).get('sample_file')
                        refs = project_cfg.get('reference_repositories', [])
                        p4_samples_root = None
                        for repo in refs:
                            if repo.get('name') == 'p4_samples':
                                p4_samples_root = repo.get('path')
                                break
                        if sample_rel and p4_samples_root:
                            base_dir = os.path.dirname(__file__)
                            sample_abs = os.path.join(base_dir, p4_samples_root, sample_rel)
                            if os.path.exists(sample_abs):
                                with open(sample_abs, 'r', encoding='utf-8', errors='ignore') as f:
                                    sample_code = f.read()
                                # Keep excerpt to control tokens
                                context_parts.append(f"Reference P4 Sample ({sample_rel}) excerpt:\n{sample_code[:8000]}...")
                except Exception:
                    pass
            if hasattr(self, 'test_catalog') and self.test_catalog:
                context_parts.append(f"Existing Test Catalog (excerpt):\n{self.test_catalog[:1500]}...")
            if commit_context:
                context_parts.append(f"Commit/Functional Context (excerpt):\n{commit_context[:3000]}...")
            context_string = "\n\n".join(context_parts)

            # Prompt - request pure P4 code, minimal, compilable skeleton for DPL
            prompt = (
                f"You are an expert P4/DPL engineer. Generate a minimal P4-16 sample aligned with DOCA Target Architecture (DPL) for BlueField.\n"
                f"The sample should align with the test objective. Use target: {p4_target}.\n"
                f"Focus: minimal parser, control, 1-2 tables/actions, default drop, counters where relevant.\n"
                f"Emit ONLY P4 code with no markdown or commentary.\n\n"
                f"Context:\n{context_string}\n\n"
                f"TEST NAME: {test_name}\n"
                f"OBJECTIVE: {test_objective}\n\n"
                f"Requirements:\n"
                f"- For DPL (preferred): use NvDocaPipeline with NvDocaParser and NvDocaMainControl shapes.\n"
                f"- Define a single main control with DPL signature: control <control_name>(inout nv_headers_t headers, in nv_standard_metadata_t std_meta, inout nv_empty_metadata_t user_meta, inout nv_empty_metadata_t pkt_out_meta) {{ ... }}.\n"
                f"- Provide a default miss/drop behavior.\n"
                f"- Include a small example table/action consistent with the objective (e.g., forward/mark/drop).\n"
                f"- Keep program name and package simple and unique based on test_name (snake_case).\n"
                f"- Keep to a single file, under 250 lines.\n"
                f"- MANDATORY: End the file by instantiating the top-level DOCA Rx package using the control you actually defined (keep names consistent):\n"
                f"// Instantiate the top-level DOCA Rx package\n"
                f"NvDocaPipeline(\n"
                f"    nv_fixed_parser(),\n"
                f"    <control_name>()\n"
                f") main;\n"
            )

            response = self.chat_completion(
                messages=[{"role": "user", "content": prompt}],
                max_tokens=3000,
                temperature=0.2,
            )

            if response and 'choices' in response and len(response['choices']) > 0:
                p4_code = response['choices'][0]['message']['content']
                # Remove accidental markdown fences
                p4_code = p4_code.replace('```p4', '').replace('```', '').strip()
                return {
                    "test_name": test_name,
                    "p4_code": p4_code,
                    "objective": test_objective,
                    "model": response.get("model", "unknown"),
                    "usage": response.get("usage", {}),
                    "target": p4_target,
                }
            else:
                return {
                    "test_name": test_name,
                    "p4_code": "Failed to generate P4 sample with NGC",
                    "error": "No response from NGC API"
                }
        except Exception as e:
            logger.error(f"Error generating P4 sample: {e}")
            return {
                "test_name": test_name,
                "p4_code": f"Error generating P4 sample: {str(e)}",
                "error": str(e)
            }
    def _parse_new_functional_tests(self, analysis_markdown: str) -> List[Dict[str, str]]:
        """Parse 'New Functional' tests from the Recommended Test Plan table.

        Returns a list of {"name": str, "objective": str}.
        """
        try:
            lines = analysis_markdown.splitlines()
            header_idx = -1
            header_cols: List[str] = []
            # Find a table header containing Test Type and Objective
            for i, line in enumerate(lines):
                if '|' in line and 'Test Type' in line and 'Objective' in line:
                    header_idx = i
                    # Normalize headers
                    header_cols = [c.strip() for c in line.strip().strip('|').split('|')]
                    break
            if header_idx == -1:
                return []

            # Build column index map (support variations)
            col_to_idx: Dict[str, int] = {}
            for idx, col in enumerate(header_cols):
                normalized = col.lower()
                if 'test type' in normalized:
                    col_to_idx['type'] = idx
                elif 'test name' in normalized:
                    col_to_idx['name'] = idx
                elif 'objective' in normalized:
                    col_to_idx['objective'] = idx
                elif 'test name/id' in normalized:
                    col_to_idx['name'] = idx

            results: List[Dict[str, str]] = []

            # Skip the separator line if present (---)
            row_idx = header_idx + 1
            if row_idx < len(lines) and set(lines[row_idx].replace('|', '').strip()) <= {'-', ' '}:
                row_idx += 1

            # Collect subsequent table rows until a non-table line
            while row_idx < len(lines):
                row = lines[row_idx]
                if '|' not in row:
                    break
                # Ignore empty/separator rows
                if set(row.replace('|', '').strip()) <= {'-', ' '}:
                    row_idx += 1
                    continue
                cells = [c.strip() for c in row.strip().strip('|').split('|')]
                # Guard against malformed rows
                if not cells or 'type' not in col_to_idx or 'name' not in col_to_idx or 'objective' not in col_to_idx:
                    row_idx += 1
                    continue

                try:
                    test_type = cells[col_to_idx['type']].lower()
                    if test_type.startswith('new functional'):
                        name_cell = cells[col_to_idx['name']]
                        # Remove surrounding brackets if present
                        if name_cell.startswith('[') and name_cell.endswith(']'):
                            name_cell = name_cell[1:-1]
                        objective_cell = cells[col_to_idx['objective']]
                        results.append({
                            'name': name_cell,
                            'objective': objective_cell,
                        })
                except Exception:
                    pass
                row_idx += 1

            return results
        except Exception:
            return []

    def _extract_functional_plan_section(self, analysis_markdown: str) -> str:
        """Extract the 'Functional QA Test Plan' or 'Functional Verification Test Plan' section text."""
        try:
            # Find heading for either QA or Verification test plan
            match = re.search(r"(^|\n)#{1,6}\s*Functional (QA|Verification) Test Plan\s*\n", analysis_markdown)
            if not match:
                return ""
            start = match.end()
            # Find next heading after start
            next_heading = re.search(r"\n#{1,6}\s+", analysis_markdown[start:])
            end = start + next_heading.start() if next_heading else len(analysis_markdown)
            return analysis_markdown[start:end].strip()
        except Exception:
            return ""

    def generate_test_code(self, test_name: str, test_objective: str, commit_context: str = "") -> Dict[str, Any]:
        """Generate Python test code for a specific functional test
        
        Args:
            test_name: Name of the test to generate
            test_objective: Objective/description of what the test should do
            commit_context: Additional context from the commit analysis
            
        Returns:
            Dictionary with generated test code and metadata
        """
        try:
            # Build context for test generation
            context_parts = []
            
            # Add repository context if available
            if self.repo_context:
                context_parts.append(f"Repository Context:\n{self.repo_context[:2000]}...")  # Limit context size
            
            # Add automation context if available
            automation_context = self.get_all_automation_contexts()
            if automation_context:
                context_parts.append(f"Automation Framework Context:\n{automation_context[:2000]}...")
            
            # Add test catalog if available
            if hasattr(self, 'test_catalog') and self.test_catalog:
                context_parts.append(f"Existing Test Patterns:\n{self.test_catalog[:1500]}...")
            
            context_string = "\n\n".join(context_parts)
            
            # Enhanced prompt for test code generation
            prompt = f"""You are an expert QA automation engineer working with the existing DOCA Pipeline Language QA automation framework. 
Generate Python test code that follows the EXACT structure and format of the existing tests.

{context_string}

EXISTING TEST STRUCTURE REQUIREMENTS:
====================================
The test MUST follow this EXACT format and naming:

1. Class Structure:
@testinfo("name:test_name;alm_id:XXXX; testlink:XXXX; owner:nvinsightai; supported_os:ubuntu")
class Test(DPLRunSuite):
    \"\"\"
    This class is implementing the case: [test_description]
    \"\"\"

2. Method Structure (EXACT order and names):
@classmethod
def before_test(cls):
    \"\"\"
    action: [description of pre-configuration actions]
    expected: [description of expected outcome]
    \"\"\"
    # Implementation here

def test_step_1(self):
    \"\"\"
    action: [description of test action]
    expected: [description of expected outcome]
    \"\"\"
    # Implementation here

def test_step_2(self):  # Only if needed
    \"\"\"
    action: [description of test action]
    expected: [description of expected outcome]
    \"\"\"
    # Implementation here

@classmethod
def after_test(cls):
    \"\"\"
    action: [description of cleanup actions]
    expected: [description of expected outcome]
    \"\"\"
    # Implementation here

3. REQUIRED IMPORTS (include ALL of these):
from src.mlnx.qa.framework.infra.label.labels import testinfo
from src.mlnx.qa.doca_pipeline_language.core.service_manager import ServiceManager
from src.mlnx.qa.doca_pipeline_language.core.devtools_manager import ToolsManager
from src.mlnx.qa.doca_pipeline_language.enums.project_enums import Status
from src.mlnx.qa.doca_pipeline_language.tests.suite import DPLRunSuite
from src.mlnx.qa.doca_pipeline_language.enums.project_enums import CloudAccJsonDPLEnums as dpl_enum

4. AVAILABLE METHODS AND CLASSES (ONLY use these existing ones):

A. DPLRunSuite (base class):
- self.cluster.hosts - list of hosts
- self.cluster.soc_hosts - list of SOC hosts
- self.session_manager - SessionManager instance
- self.reporter.success(message, details) - report success
- self.reporter.fail(message, details) - report failure

B. ServiceManager:
- __init__(soc_host_ip) - initialize with SOC host IP
- configure_device(device_id) - configure device
- add_interface_to_device(device_id, interface_name, vf_id, mtu) - add interface
- restart_rtd(timeout) - restart RTD service
- validate_dpl_rtd_started(timeout) - validate RTD started

C. ToolsManager:
- __init__(host_ip, soc_host_ip, reporter) - initialize with host and SOC IPs
- get_nspect_tool() - get DPLNspect tool instance
- get_compiler_tool() - get DPLCompiler tool instance
- get_p4runtime_tool() - get P4Runtime tool instance
- update_nspect_data() - update nspect data

D. P4Runtime (from get_p4runtime_tool()):
- load_program_to_agent(p4_program_path, device_id, service_address) - load P4 program
- create_entry(device_id, table_name, action_name) - create table entry
- set_params(params_dict) - set entry parameters
- insert_entry() - insert table entry
- delete_entry() - delete table entry
- exit_p4runtime() - exit P4 runtime session

E. DPLNspect (from get_nspect_tool()):
- Use existing methods from the DPLNspect class

F. DPLCompiler (from get_compiler_tool()):
- Use existing methods from the DPLCompiler class

G. Status enum values:
- Status.PASS - for successful operations
- Status.FAIL - for failed operations

H. CloudAccJsonDPLEnums (dpl_enum):
- dpl_enum.HOST.value - for host references

5. CRITICAL REQUIREMENTS:
- Class name MUST be Test (not TestSomething)
- Method names MUST be before_test, test_step_1, test_step_2 (if needed), after_test
- Use @testinfo decorator with proper format
- Owner MUST be nvinsightai in the @testinfo decorator
- Extend from DPLRunSuite
- Include ALL required imports listed above
- ONLY use existing methods and classes listed above
- Use existing Status enum values (Status.PASS, Status.FAIL)
- Use existing connection patterns and tool managers
- Follow existing error handling patterns
- DO NOT create new modules or classes that don't exist
- DO NOT import modules that aren't in the existing framework
- DO NOT use methods that don't exist in the listed classes

6. TEST IMPLEMENTATION PATTERN:
- Initialize ServiceManager with soc_host.ip
- Initialize ToolsManager with host.ip and soc_host.ip
- Use existing methods from these managers
- Check return values against Status.PASS/FAIL
- Use self.reporter.success() and self.reporter.fail() for reporting
- Access cluster hosts and SOC hosts through self.cluster.hosts and self.cluster.soc_hosts

7. IMPORTANT: After generating the test code, add these completion notes using # comments:

# CRITICAL NOTES FOR COMPLETION/ADJUSTMENT:
# 
# 1. Interface Name, VF_ID, MTU in test_step_1: Update "example_intf", vf_id, and mtu with actual values relevant to your test environment.
# 
# 2. test_step_2 Implementation: The actual implementation for performing nv_add_entry and nv_send_to_controller and verifying loopback on all vports is NOT PROVIDED due to the lack of specific methods in the given framework description. You must replace the placeholder comments and code with the actual methods and logic based on your framework's capabilities and the test's requirements.
# 
# 3. Error Handling and Logging: While the example includes basic reporting, consider enhancing error handling for more informative logging, especially in test_step_2 where the implementation details are currently vague.
# 
# 4. Timeouts: Adjust timeouts in validate_dpl_rtd_started and restart_rtd as necessary to fit your test environment's performance.

ABSOLUTE FORMATTING REQUIREMENT - THIS IS CRITICAL:
- Generate ONLY the Python code WITHOUT ANY markdown formatting whatsoever
- DO NOT include ```python at the beginning
- DO NOT include ``` at the end
- DO NOT include any backticks or markdown symbols
- DO NOT wrap the code in any formatting blocks
- Start directly with the first import statement
- End with the last completion note
- The output should be pure, raw Python code that can be copied and pasted directly into a .py file
- If you include any markdown formatting, the code will be unusable

SPECIFIC TEST REQUIREMENTS:
Test Name: {test_name}
Test Objective: {test_objective}
Commit Context: {commit_context}

Generate ONLY the Python test code that follows this EXACT structure and uses ONLY the existing methods listed above, followed by the completion notes. NO MARKDOWN FORMATTING AT ALL:"""
            
            # Use existing NGC chat completion
            response = self.chat_completion(
                messages=[{"role": "user", "content": prompt}],
                max_tokens=4000,
                temperature=0.1
            )
            
            if response and 'choices' in response and len(response['choices']) > 0:
                generated_code = response['choices'][0]['message']['content']
                
                # Clean any markdown that might still be there
                cleaned_code = generated_code.replace('```python', '').replace('```', '').strip()
                
                return {
                    "test_name": test_name,
                    "test_code": cleaned_code,
                    "objective": test_objective,
                    "model": response.get("model", "unknown"),
                    "usage": response.get("usage", {}),
                    "commit_context": commit_context
                }
            else:
                return {
                    "test_name": test_name,
                    "test_code": "Failed to generate test code with NGC",
                    "error": "No response from NGC API"
                }
                
        except Exception as e:
            logger.error(f"Error generating test code: {e}")
            return {
                "test_name": test_name,
                "test_code": f"Error generating test code: {str(e)}",
                "error": str(e)
            }

    def generate_test_plan_from_feature_text(self, feature_text: str, project_name: Optional[str] = None, additional_prompt: str = "") -> Dict[str, Any]:
        """Generate a QA test plan using ONLY the provided document text as context.

        This avoids including repository/automation/test-catalog contexts to stay within model limits.
        """
        try:
            # Trim document to fit within context limits with buffer for instructions and completion
            # Rough estimate: 1 token ~ 4 chars
            max_context_tokens = self.MAX_TOKENS
            completion_tokens = 4000
            instruction_tokens = 2000
            available_tokens_for_doc = max(0, max_context_tokens - completion_tokens - instruction_tokens)
            max_chars_for_doc = available_tokens_for_doc * 4
            doc = feature_text or ""
            if len(doc) > max_chars_for_doc:
                doc = doc[:max_chars_for_doc]

            # Compose prompt using only the document (+ optional user instructions)
            extra = (additional_prompt or "").strip()
            if extra:
                # Clamp extra to a safe size
                max_extra_chars = 4000
                if len(extra) > max_extra_chars:
                    extra = extra[:max_extra_chars]
            # Recompute doc budget if extra present
            if extra:
                extra_tokens = len(extra) // 4
                available_tokens_for_doc = max(0, available_tokens_for_doc - extra_tokens)
                max_chars_for_doc = available_tokens_for_doc * 4
                if len(doc) > max_chars_for_doc:
                    doc = doc[:max_chars_for_doc]

            prompt = f"""
You are an expert QA Test Planner. Given the following Feature Design Document, produce a rigorous, actionable QA test plan.

FEATURE DESIGN DOCUMENT (raw text):
-----------------------------------
{doc}

{('USER ADDITIONAL INSTRUCTIONS:\n-------------------------------\n' + extra) if extra else ''}

Pay close attention to the Markdown format with these guidelines (strictly follow):
- Use # for main headers (h1)
- Use ## for section headers (h2)
- Use ### for subsections (h3)
- Use * or - for bullet points, and ALWAYS use bullet points for any list of steps
- Use `code` for technical terms, and only use **bold** for critical highlights

Format your response in exactly three sections using Markdown:

# Feature Understanding
- Summarize the feature behavior and scope
- Enumerate components/systems impacted
- Identify assumptions, constraints, and out-of-scope items

# Functional QA Test Plan
- Black-box tests from QA perspective organized by functional areas
- For each scenario include:
  * Objective
  * Test Steps: 6–8 detailed, sequential steps as BULLET POINTS (setup, configuration, execution, validation, cleanup). Each step MUST be concise and actionable
  * Expected Behavior

# Recommended Test Plan For This Feature
Create a comprehensive test plan table combining only the new functional tests derived above.

Use this exact table format:
| Test Type | Test Name/ID | Objective | Quality Category | Reason | Expected Result | Priority (0-10) |
|-----------|--------------|-----------|------------------|--------|-----------------|-----------------|
| New Functional | [Test Name] | [Objective] | [One or more: Features/Functionality; Backward compatibility; Configuration/Setup; Installation/Upgrade; Interoperability; Logging & debugability; Performance; Reliability; Scale; Bad Flow] | [Why this test is needed] | [Expected result] | [0..10 where 0 is highest priority] |
"""

            messages = [
                {"role": "system", "content": "You are a meticulous QA test planner that produces actionable, structured test plans. Use ONLY the user's document content as context."},
                {"role": "user", "content": prompt},
            ]

            # Slightly reduce completion tokens to lower latency and avoid timeouts
            response = self.chat_completion(messages=messages, max_tokens=min(completion_tokens, 3000), temperature=0.4, retries=2, timeout_seconds=600)

            if not response or 'choices' not in response:
                raise ValueError(f"NGC API returned unexpected response: {response}")

            content = response['choices'][0]['message']['content']
            usage = response.get('usage', {})
            model = response.get('model', 'unknown')

            parsed_new_tests = self._parse_new_functional_tests(content)
            functional_plan_text = self._extract_functional_plan_section(content)

            return {
                "test_plan": content,
                "model": model,
                "usage": usage,
                "project_name": project_name,
                "new_functional_tests": parsed_new_tests,
                "functional_plan": functional_plan_text,
            }
        except Exception as e:
            logger.error(f"Error generating test plan from feature text: {e}")
            if hasattr(e, 'response') and hasattr(e.response, 'text'):
                logger.error(f"Response: {e.response.text}")
            return {"error": str(e)}

def get_project_config(project_name: str) -> Dict:
    """Get configuration for a specific project"""
    # Import the function from app.py or implement it here
    from app import get_project_config
    return get_project_config(project_name)

def main():
    # Example usage
    try:
        # Initialize the client
        client = NGCClient()
        
        # Scan repository and set context
        repo_context = client.scan_repository(max_files=50)  # Limit to 50 files for example
        client.set_repository_context(repo_context)
        
        # Set test plan context
        client.set_test_plan_context("""
        This is a sample test plan context that would contain information about existing test cases,
        test coverage, and testing strategies.
        """)
        
        # Example commit message and code changes
        commit_message = "Fix bug in login system"
        code_changes = """
        - Modified authentication logic in login.py
        - Updated password validation
        - Added error handling for invalid credentials
        """
        
        # Get the analysis
        result = client.analyze_commit(commit_message, code_changes)
        
        # Print the results
        print("\nAnalysis Results:")
        print("----------------")
        print(f"Model used: {result['model']}")
        print("\nAnalysis:")
        print(result['analysis'])
        print("\nToken usage:")
        print(f"Prompt tokens: {result['usage']['prompt_tokens']}")
        print(f"Completion tokens: {result['usage']['completion_tokens']}")
        print(f"Total tokens: {result['usage']['total_tokens']}")
    except Exception as e:
        print(f"An error occurred: {str(e)}")

if __name__ == "__main__":
    main() 
