// vue-tsc drives the TypeScript compiler through its JavaScript API, which TypeScript 7 no
// longer has, so the Vue check runs on TypeScript 6 (@typescript/typescript6) while
// everything else uses 7. Takes vue-tsc's own arguments. Drop this once vue-tsc runs on 7.
require('vue-tsc').run(require.resolve('@typescript/typescript6/lib/tsc'))
