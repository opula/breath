// Loose module typings for "three/tsl" (wired via tsconfig "paths").
//
// @types/three's TSL generics (0.18x) infer per-overload VarNode/JoinNode
// types that reject valid node graphs at call sites — swizzles, math-method
// chains, and Fn() argument variance all mis-resolve. The TSL runtime is
// untyped graph construction, so this app types the whole surface as `any`,
// matching the posture of the licensed packs this code derives from.
//
// Add exports here as new TSL functions are used; tsc will flag missing ones.

export declare const Fn: any;
export declare const If: any;
export declare const Switch: any;
export declare const Loop: any;
export declare const Break: any;
export declare const Continue: any;

export declare const float: any;
export declare const int: any;
export declare const uint: any;
export declare const bool: any;
export declare const vec2: any;
export declare const vec3: any;
export declare const vec4: any;
export declare const ivec2: any;
export declare const ivec3: any;
export declare const ivec4: any;
export declare const uvec2: any;
export declare const uvec3: any;
export declare const uvec4: any;
export declare const bvec2: any;
export declare const bvec3: any;
export declare const bvec4: any;
export declare const mat2: any;
export declare const mat3: any;
export declare const mat4: any;
export declare const color: any;
export declare const array: any;

export declare const abs: any;
export declare const acos: any;
export declare const all: any;
export declare const any: any;
export declare const asin: any;
// atan handles both one-arg and two-arg (former atan2, removed at runtime) forms.
export declare const atan: any;
export declare const ceil: any;
export declare const clamp: any;
export declare const cos: any;
export declare const cross: any;
export declare const degrees: any;
export declare const dFdx: any;
export declare const dFdy: any;
export declare const distance: any;
export declare const dot: any;
export declare const exp: any;
export declare const exp2: any;
export declare const faceForward: any;
export declare const floor: any;
export declare const fract: any;
export declare const fwidth: any;
export declare const inverseSqrt: any;
export declare const length: any;
export declare const log: any;
export declare const log2: any;
export declare const max: any;
export declare const min: any;
export declare const mix: any;
export declare const mod: any;
export declare const negate: any;
export declare const normalize: any;
export declare const oneMinus: any;
export declare const pow: any;
export declare const pow2: any;
export declare const pow3: any;
export declare const pow4: any;
export declare const radians: any;
export declare const reflect: any;
export declare const refract: any;
export declare const remap: any;
export declare const remapClamp: any;
export declare const round: any;
export declare const saturate: any;
export declare const select: any;
export declare const sign: any;
export declare const sin: any;
export declare const smoothstep: any;
export declare const sqrt: any;
export declare const step: any;
export declare const tan: any;
export declare const trunc: any;

export declare const hash: any;
export declare const rotate: any;
export declare const luminance: any;

export declare const uniform: any;
export declare const uniformArray: any;
export declare const attribute: any;
export declare const property: any;
export declare const varying: any;
export declare const varyingProperty: any;
export declare const storage: any;
export declare const instancedArray: any;
export declare const instanceIndex: any;
export declare const vertexIndex: any;
export declare const vertexColor: any;
export declare const frontFacing: any;

export declare const uv: any;
export declare const equirectUV: any;
export declare const texture: any;
export declare const texture3D: any;
export declare const textureStore: any;
export declare const cubeTexture: any;
export declare const pmremTexture: any;

export declare const positionGeometry: any;
export declare const positionLocal: any;
export declare const positionWorld: any;
export declare const positionView: any;
export declare const positionViewDirection: any;
export declare const normalLocal: any;
export declare const normalWorld: any;
export declare const normalView: any;
export declare const cameraPosition: any;
export declare const cameraViewMatrix: any;
export declare const cameraProjectionMatrix: any;
export declare const cameraWorldMatrix: any;
export declare const modelWorldMatrix: any;
export declare const modelViewMatrix: any;

export declare const screenUV: any;
export declare const screenCoordinate: any;
export declare const screenSize: any;
export declare const viewportUV: any;

export declare const time: any;
export declare const deltaTime: any;

export declare const pass: any;
export declare const mrt: any;
export declare const output: any;
export declare const rtt: any;
export declare const convertToTexture: any;
export declare const renderOutput: any;

export declare const PI: any;
export declare const PI2: any;
export declare const EPSILON: any;
