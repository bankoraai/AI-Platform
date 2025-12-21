import { Box, Card, CardContent, Typography } from '@mui/material'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function PlanLegacyText(props: { text: string }) {
  return (
    <Card>
      <CardContent>
        <Box sx={{ wordBreak: 'break-word' }}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <Typography variant="h2" sx={{ mt: 0, mb: 1 }}>
                  {children}
                </Typography>
              ),
              h2: ({ children }) => (
                <Typography variant="h2" sx={{ mt: 3, mb: 1 }}>
                  {children}
                </Typography>
              ),
              h3: ({ children }) => (
                <Typography variant="h3" sx={{ mt: 3, mb: 1 }}>
                  {children}
                </Typography>
              ),
              h4: ({ children }) => (
                <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>
                  {children}
                </Typography>
              ),
              p: ({ children }) => (
                <Typography variant="body1" sx={{ mb: 1.25 }}>
                  {children}
                </Typography>
              ),
              strong: ({ children }) => (
                <Box component="strong" sx={{ fontWeight: 700 }}>
                  {children}
                </Box>
              ),
              em: ({ children }) => (
                <Box component="em" sx={{ fontStyle: 'italic' }}>
                  {children}
                </Box>
              ),
              ul: ({ children }) => (
                <Box component="ul" sx={{ mt: 0.5, mb: 1.5, pl: 3 }}>
                  {children}
                </Box>
              ),
              ol: ({ children }) => (
                <Box component="ol" sx={{ mt: 0.5, mb: 1.5, pl: 3 }}>
                  {children}
                </Box>
              ),
              li: ({ children }) => (
                <Box component="li" sx={{ mb: 0.5 }}>
                  <Typography variant="body1" component="span">
                    {children}
                  </Typography>
                </Box>
              ),
              hr: () => <Box sx={{ my: 2, borderBottom: '1px solid', borderColor: 'divider' }} />,
              code: ({ children }) => (
                <Box
                  component="code"
                  sx={{
                    px: 0.75,
                    py: 0.25,
                    borderRadius: 1,
                    bgcolor: 'rgba(15, 23, 42, 0.06)',
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    fontSize: '0.9em',
                  }}
                >
                  {children}
                </Box>
              ),
            }}
          >
            {props.text}
          </ReactMarkdown>
        </Box>
      </CardContent>
    </Card>
  )
}


