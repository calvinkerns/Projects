// Shared 3D Gaussian covariance construction.
//
// This used to be copy-pasted verbatim into plyParser.js, splatGenerator.js and
// txtParser.js. One copy now, so the three cannot drift apart.
//
// Returns the SIX unique terms of the symmetric 3x3 covariance:
//
//     [ s0  s1  s2 ]
//     [ s1  s3  s4 ]     ->  [s0, s1, s2, s3, s4, s5]
//     [ s2  s4  s5 ]
//
// The previous version returned only [s0, s1, s3] and the shader faked the rest
// with an identity z-block. That discarded every term involving z, which made a
// splat's on-screen shape independent of the camera -- flat or elongated splats
// collapsed into permanent slivers no matter where you looked from.
export function computeCovariance(scales, rotation) {
    const [qx, qy, qz, qw] = rotation;
    const R = [
        1.0 - 2.0 * (qy * qy + qz * qz),
        2.0 * (qx * qy + qz * qw),
        2.0 * (qx * qz - qy * qw),

        2.0 * (qx * qy - qz * qw),
        1.0 - 2.0 * (qx * qx + qz * qz),
        2.0 * (qy * qz + qx * qw),

        2.0 * (qx * qz + qy * qw),
        2.0 * (qy * qz - qx * qw),
        1.0 - 2.0 * (qx * qx + qy * qy)
    ];

    const S = scales.map(s => Math.max(s, 0.0001));
    const M = R.map((k, i) => k * S[Math.floor(i / 3)]);

    // Same M'M product the old code computed -- the rotation convention is
    // preserved exactly, terms 0/1/3 below are bit-identical to the old 0/1/2.
    return [
        M[0] * M[0] + M[3] * M[3] + M[6] * M[6],   // 00
        M[0] * M[1] + M[3] * M[4] + M[6] * M[7],   // 01
        M[0] * M[2] + M[3] * M[5] + M[6] * M[8],   // 02
        M[1] * M[1] + M[4] * M[4] + M[7] * M[7],   // 11
        M[1] * M[2] + M[4] * M[5] + M[7] * M[8],   // 12
        M[2] * M[2] + M[5] * M[5] + M[8] * M[8]    // 22
    ];
}
