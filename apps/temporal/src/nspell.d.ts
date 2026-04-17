declare module "nspell" {
  import type { Buffer } from "node:buffer";

  export interface NSpell {
    correct(word: string): boolean;
    suggest(word: string): string[];
  }

  function nspell(aff: Buffer, dic: Buffer): NSpell;
  export default nspell;
}
