// API pública do Forge para repositórios que o incorporam como submódulo.
// Importe somente deste arquivo; os demais módulos de `src/` são internos.
export { signerKeys, trustedApprovers, verifyApproval, type Approval } from "./approval.ts";
export { verifyOutput, type Manifest } from "./manifest.ts";
export { exec, isModulePath, parseLog, svnLog, svnRange, type SvnEntry } from "./svn.ts";
export { RELEASE_TARGETS, TARGETS } from "./review.ts";
