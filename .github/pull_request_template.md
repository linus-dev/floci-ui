## Summary

<!-- What does this PR do? Link any related issues with "Closes #N" -->

## Type of change

- [ ] Bug fix (`fix:`)
- [ ] New feature / service UI (`feat:`)
- [ ] Breaking change (`feat!:` or `fix!:`)
- [ ] Docs / chore

## Area

- [ ] Frontend (`packages/frontend`)
- [ ] API / Cloud Proxy (`packages/api`)
- [ ] Cloud Explorer adapter / schema
- [ ] Build / CI / Docker

## Verification

<!-- How did you verify this? Which cloud + service did you test against
     (e.g. AWS S3 via Floci core, Azure Blob via Floci-AZ)? -->
<!-- For UI changes, please attach before/after screenshots. -->

## Checklist

- [ ] `pnpm lint`, `pnpm type-check`, `pnpm test`, and `pnpm build` pass locally
- [ ] New or updated tests added where it makes sense (`bun test` in `packages/api`)
- [ ] No fake/mock data added — unwired states stay empty or show an explicit placeholder
- [ ] Commit messages / PR title follow [Conventional Commits](https://www.conventionalcommits.org/)
