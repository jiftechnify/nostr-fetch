# nostr-fetch Examples
Basic code examples for nostr-fetch.

## How to Run
Run following commands in the root directory of the project.

```bash
# first time only: install dependencies & build subpackages
npm install && npm run build


# then, execute example
# the command executes packages/@nostr-fetch/examples/src/fetchAll.ts
npm run example fetchAll

# "getProfiles" takes a hex pubkey as an argument
npm run example getProfiles <your hex pubkey>
```
