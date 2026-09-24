# @acme/chemistry (example third-party module)

A complete third-party Deterministic Tools module, built only on the public
`@rickrosten/agent-deterministic-tools-core` API. It adds:

| Tool | Purpose |
| --- | --- |
| `chemistry.molar_mass` | molar mass and composition of a formula (`H2O`, `Ca(OH)2`, `CuSO4·5H2O`) |
| `chemistry.molarity` | mol/L from moles or mass + formula |
| `chemistry.dilution` | solve C1V1 = C2V2 |

```text
examples/acme-chemistry/
├── src/
│   ├── index.ts      # defineModule(...) default export
│   ├── tools.ts      # defineTool(...) x 3
│   ├── formula.ts    # safe formula parser (no eval)
│   └── elements.ts   # IUPAC 2021 abridged atomic weights
├── tests/
│   └── chemistry.test.ts
├── package.json
└── README.md
```

## Try it

```bash
npm run build                                               # from the repository root
npx @rickrosten/agent-deterministic-tools plugin add ./examples/acme-chemistry --no-install
npx @rickrosten/agent-deterministic-tools call chemistry.molar_mass '{"formula":"C6H12O6"}'
```

## Publish your own

1. Copy this directory, rename the package (`@your-scope/your-module`) and the module `id`.
2. Remove `"private": true`.
3. `npm run build && npm publish --access public`.
4. Users enable it with `npx @rickrosten/agent-deterministic-tools plugin add @your-scope/your-module`.

See [docs/creating-a-module.md](../../docs/creating-a-module.md).
