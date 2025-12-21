export const tokens = {
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
  },
  border: {
    subtleAlpha: 0.10,
    strongAlpha: 0.16,
  },
  shadow: {
    // Premium finance: restrained shadows, rely on borders + subtle lift.
    sm: '0 1px 2px rgba(15, 23, 42, 0.06)',
    md: '0 8px 20px rgba(15, 23, 42, 0.08)',
  },
  layout: {
    maxContentWidth: 'lg' as const,
    pageGutterY: 4,
  },
  space: {
    // MUI spacing is theme-controlled; these are semantic steps used in sx props.
    xs: 1,
    sm: 2,
    md: 3,
    lg: 4,
    xl: 6,
  },
  typography: {
    fontFamily:
      'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
  },
} as const


