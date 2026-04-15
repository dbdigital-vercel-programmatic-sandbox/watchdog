# Next.js template

This is a Next.js template with shadcn/ui.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button"
```

## AI Gateway auth

This app uses Vercel AI Gateway model IDs (for example `anthropic/claude-sonnet-4.5`) via the AI SDK.

- Vercel deployment: use OIDC auth automatically (no provider key and no `AI_GATEWAY_API_KEY` required in production).
- Local development: set `APP_BUILDER_VERCEL_AI_GATEWAY` in `.env.local`.
- The app initializes the Gateway provider with `APP_BUILDER_VERCEL_AI_GATEWAY` and mirrors it to `AI_GATEWAY_API_KEY` at runtime for SDK compatibility.
