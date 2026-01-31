# Package.json Validation Hook

Before modifying this package.json, verify:

## Version Constraints

1. **@vitejs/plugin-vue**
   - Root/packages: Must be `^5.x.x`
   - apps/web only: Can be `^6.x.x`
   - Do NOT change this split

2. **typescript**
   - Must be `~5.7.0` everywhere
   - Do NOT use `^5.x` or other versions

3. **vue**
   - Must be `3.5.24` everywhere
   - Must be identical across all packages

4. **vite**
   - Must be `7.2.4` everywhere
   - Must be identical across all packages

## Dependency Rules

5. **@inkdown/shared**
   - Must have ZERO `@inkdown/*` dependencies
   - If adding a dependency here, STOP and reconsider

6. **@inkdown/ai**
   - Only `@inkdown/shared` as peerDependency
   - No other internal dependencies

7. **Circular dependencies**
   - No package should depend on a package that depends on it

## Node.js Version

8. **engines.node**
   - Should be `>=20.0.0`
   - Check .nvmrc matches

## Proceed?

If any constraints would be violated, BLOCK the change and explain why.
