// Builds a 3D gaussian covariance from scale + rotation.
// Returns the 6 unique terms of the symmetric 3x3 matrix: [00, 01, 02, 11, 12, 22]
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

    // M'M
    return [
        M[0] * M[0] + M[3] * M[3] + M[6] * M[6],   // 00
        M[0] * M[1] + M[3] * M[4] + M[6] * M[7],   // 01
        M[0] * M[2] + M[3] * M[5] + M[6] * M[8],   // 02
        M[1] * M[1] + M[4] * M[4] + M[7] * M[7],   // 11
        M[1] * M[2] + M[4] * M[5] + M[7] * M[8],   // 12
        M[2] * M[2] + M[5] * M[5] + M[8] * M[8]    // 22
    ];
}
