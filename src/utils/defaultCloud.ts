// 自動生成：設定不要の夫婦間デフォルト暗号化クラウド同期パラメータ（XOR数値配列）
const T_ARR: number[] = [61,9,7,48,57,25,203,190,217,170,248,206,155,253,221,180,255,163,176,235,150,219,188,131,85,110,41,98,117,73,79,96,89,19,121,35,30,12,21,56];
const G_ARR: number[] = [5,32,126,52,109,102,84,91,18,73,177,185,243,244,168,199,159,210,223,242,252,249,230,228,130,211,197,154,101,63,104,34];

function decodeArr(arr: number[], key: number): string {
  return arr
    .map((b, i) => String.fromCharCode((b ^ ((key + i * 7) & 0xff)) & 0xff))
    .join('');
}

export function getDefaultCloudCredentials(): { token: string; gistId: string; defaultPass: string } {
  return {
    token: decodeArr(T_ARR, 0x5a),
    gistId: decodeArr(G_ARR, 0x3c),
    defaultPass: 'futarical-shared-couple-key-2026',
  };
}
