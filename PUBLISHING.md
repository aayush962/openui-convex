# Publishing

The package publishes to npm as `openui-convex`. You need an npm account that may publish that name.

## First release

1. `npm login`.
2. `pnpm install --frozen-lockfile` to install the locked dependencies.
3. `npm run build:clean` to regenerate the component's generated code against your development deployment and rebuild `dist`.
4. `npm run check` to typecheck, lint, test, and build the example.
5. `node scripts/changelog.mjs 0.1.0` to turn the `## Unreleased` section of `CHANGELOG.md` into the release notes, then commit it.
6. (Optional) `npm pack`, then `npm install ./openui-convex-0.1.0.tgz` in another project to confirm the entry points resolve. Delete the `.tgz` afterwards.
7. `npm publish --access public`.
8. `git tag v0.1.0 && git push --follow-tags`.

## Later releases

The release scripts run steps 2 to 8 for you:

- `npm run alpha` publishes a prerelease under the `alpha` tag. Install it with `npm install openui-convex@alpha`.
- `npm run release` publishes a patch release as `latest`. For a minor or major release, run `npm version minor` (or `major`), then `npm publish` and `git push --follow-tags`.

Both go through `npm version`, whose hooks do the work:

- `preversion` installs, rebuilds from a clean codegen, and runs typecheck, lint, and tests.
- `version` checks that you are logged in, promotes `## Unreleased` in `CHANGELOG.md` to the new version, and stages the file so it lands in the version commit.
- `prepare` rebuilds `dist` before `npm publish` and `npm pack`.

Keep release notes under `## Unreleased` in `CHANGELOG.md` as you go; the `version` hook refuses to run without that section.

## One-off package

```sh
npm run build:clean
npm pack
```

Share the `.tgz` for `npm install ./path/to/openui-convex-<version>.tgz`.
