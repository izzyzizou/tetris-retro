# Contributing

Thanks for your interest in improving Tetris Retro! Bug reports, ideas and pull requests are all welcome.

## Reporting bugs and suggesting features

Open an [issue](https://github.com/izzyzizou/tetris-retro/issues) and include:

- what you expected to happen and what happened instead
- steps to reproduce (keys pressed, level, browser and OS)
- a screenshot or recording if it's a visual problem

## Development setup

Requires Node.js 20.19+ or 22.12+.

```bash
git clone https://github.com/izzyzizou/tetris-retro.git
cd tetris-retro
npm install
npm run dev
```

In dev mode the running app is exposed as `window.app` in the browser console, which is handy for setting up board states while debugging.

## Making changes

1. Fork the repo and create a branch from `main`.
2. Keep game rules in `src/game/` free of DOM code so they stay unit-testable; browser concerns (rendering, input, audio, storage) belong in `src/engine/`.
3. Add or update tests in `src/game/*.test.ts` when you change gameplay logic.
4. Make sure everything passes before opening a pull request:

   ```bash
   npm run typecheck
   npm test
   npm run build
   ```

5. Open a pull request describing what changed and why. Screenshots are appreciated for visual changes.

CI runs the same checks on every push and pull request.

## Code style

- TypeScript in strict mode; avoid `any`.
- Match the existing formatting: 2-space indentation, single quotes, semicolons, trailing commas.
- Keep comments short and focused on *why*, not *what*.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
