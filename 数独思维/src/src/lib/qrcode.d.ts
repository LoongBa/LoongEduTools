// QR Code Generator for JavaScript（MIT，Kazuhiko Arase）
// 老版本（RedTools 数独思维 v1.34）同款 qrcode.js，转 ESM 供 Vite 直接 import。
declare const qrcode: {
  stringToBytes: (s: string) => number[];
  stringToBytesFuncs: Record<string, (s: string) => number[]>;
  (typeNumber: number, errorCorrectionLevel: "L" | "M" | "Q" | "H"): {
    addData: (data: string) => void;
    make: () => void;
    getModuleCount: () => number;
    isDark: (r: number, c: number) => boolean;
  };
};
export default qrcode;
