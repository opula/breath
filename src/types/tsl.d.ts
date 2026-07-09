// Permissive type for TSL node arguments in Fn() signatures. @types/three's
// TSL generics (0.18x) infer per-overload VarNode/JoinNode types that reject
// valid node graphs at call sites; the TSL runtime itself is untyped, so
// shader-builder params are typed loosely on purpose.
type TSLNode = any;
