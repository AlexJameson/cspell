import type { ITrieNodeRoot } from '../ITrieNode/ITrieNode.js';
import type { PartialTrieOptions, TrieOptions } from '../ITrieNode/TrieOptions.js';
import type { TrieData } from '../TrieData.js';
import { mergeOptionalWithDefaults } from '../utils/mergeOptionalWithDefaults.js';
import { extractInfo, type FastTrieBlobBitMaskInfo } from './FastTrieBlobBitMaskInfo.js';
import { FastTrieBlobInternals } from './FastTrieBlobInternals.js';
import { FastTrieBlobIRoot } from './FastTrieBlobIRoot.js';
import { TrieBlob } from './TrieBlob.js';

type FastTrieBlobNode = number[];

type CharIndexMap = Record<string, number>;

export class FastTrieBlob implements TrieData {
    private charToIndexMap: CharIndexMap;
    private _readonly = false;

    readonly options: Readonly<TrieOptions>;

    private constructor(
        private nodes: FastTrieBlobNode[],
        private charIndex: string[],
        readonly bitMasksInfo: FastTrieBlobBitMaskInfo,
        options?: PartialTrieOptions
    ) {
        this.options = mergeOptionalWithDefaults(options);
        this.charToIndexMap = createCharToIndexMap(charIndex);
    }

    private lookUpCharIndex(char: string): number {
        return this.charToIndexMap[char] ?? -1;
    }

    has(word: string): boolean {
        const NodeMaskChildCharIndex = this.bitMasksInfo.NodeMaskChildCharIndex;
        const NodeChildRefShift = this.bitMasksInfo.NodeChildRefShift;
        const NodeMaskEOW = this.bitMasksInfo.NodeMaskEOW;
        const nodes = this.nodes;
        const len = word.length;
        let nodeIdx = 0;
        let node = nodes[nodeIdx];
        for (let p = 0; p < len; ++p, node = nodes[nodeIdx]) {
            const letterIdx = this.lookUpCharIndex(word[p]);
            const count = node.length;
            let i = count - 1;
            for (; i > 0; --i) {
                if ((node[i] & NodeMaskChildCharIndex) === letterIdx) {
                    break;
                }
            }
            if (i < 1) return false;
            nodeIdx = node[i] >>> NodeChildRefShift;
        }

        return !!(node[0] & NodeMaskEOW);
    }

    *words(): Iterable<string> {
        interface StackItem {
            nodeIdx: number;
            pos: number;
            word: string;
        }
        const NodeMaskChildCharIndex = this.bitMasksInfo.NodeMaskChildCharIndex;
        const NodeChildRefShift = this.bitMasksInfo.NodeChildRefShift;
        const NodeMaskEOW = this.bitMasksInfo.NodeMaskEOW;
        const nodes = this.nodes;
        const stack: StackItem[] = [{ nodeIdx: 0, pos: 0, word: '' }];
        let depth = 0;

        while (depth >= 0) {
            const { nodeIdx, pos, word } = stack[depth];
            const node = nodes[nodeIdx];

            if (!pos && node[0] & NodeMaskEOW) {
                yield word;
            }
            if (pos >= node.length - 1) {
                --depth;
                continue;
            }
            const nextPos = ++stack[depth].pos;
            const entry = node[nextPos];
            const charIdx = entry & NodeMaskChildCharIndex;
            const letter = this.charIndex[charIdx];
            ++depth;
            stack[depth] = {
                nodeIdx: entry >>> NodeChildRefShift,
                pos: 0,
                word: word + letter,
            };
        }
    }

    toTrieBlob(): TrieBlob {
        const NodeMaskChildCharIndex = this.bitMasksInfo.NodeMaskChildCharIndex;
        const NodeChildRefShift = this.bitMasksInfo.NodeChildRefShift;
        const nodes = this.nodes;
        function calcNodeToIndex(nodes: number[][]): number[] {
            let offset = 0;
            const idx: number[] = Array(nodes.length + 1);
            for (let i = 0; i < nodes.length; ++i) {
                idx[i] = offset;
                offset += nodes[i].length;
            }
            idx[nodes.length] = offset;
            return idx;
        }

        const nodeToIndex = calcNodeToIndex(nodes);
        const nodeElementCount = nodeToIndex[nodeToIndex.length - 1];
        const binNodes = new Uint32Array(nodeElementCount);
        const lenShift = TrieBlob.NodeMaskNumChildrenShift;
        const refShift = TrieBlob.NodeChildRefShift;

        let offset = 0;
        for (let i = 0; i < nodes.length; ++i) {
            const node = nodes[i];
            // assert(offset === nodeToIndex[i]);
            binNodes[offset++] = ((node.length - 1) << lenShift) | node[0];
            for (let j = 1; j < node.length; ++j) {
                const v = node[j];
                const nodeRef = v >>> NodeChildRefShift;
                const charIndex = v & NodeMaskChildCharIndex;
                binNodes[offset++] = (nodeToIndex[nodeRef] << refShift) | charIndex;
            }
        }

        return new TrieBlob(binNodes, this.charIndex, this.options);
    }

    isReadonly(): boolean {
        return this._readonly;
    }

    freeze(): this {
        this._readonly = true;
        return this;
    }

    static create(data: FastTrieBlobInternals, options?: PartialTrieOptions) {
        return new FastTrieBlob(data.nodes, data.charIndex, extractInfo(data), options);
    }

    static toITrieNodeRoot(trie: FastTrieBlob): ITrieNodeRoot {
        return new FastTrieBlobIRoot(
            new FastTrieBlobInternals(trie.nodes, trie.charIndex, trie.charToIndexMap, trie.bitMasksInfo),
            0,
            trie.options
        );
    }

    static NodeMaskEOW = TrieBlob.NodeMaskEOW;
    static NodeChildRefShift = TrieBlob.NodeChildRefShift;
    static NodeMaskChildCharIndex = TrieBlob.NodeMaskChildCharIndex;

    static DefaultBitMaskInfo: FastTrieBlobBitMaskInfo = {
        NodeMaskEOW: FastTrieBlob.NodeMaskEOW,
        NodeMaskChildCharIndex: FastTrieBlob.NodeMaskChildCharIndex,
        NodeChildRefShift: FastTrieBlob.NodeChildRefShift,
    };

    get iTrieRoot(): ITrieNodeRoot {
        return FastTrieBlob.toITrieNodeRoot(this);
    }
}

function createCharToIndexMap(charIndex: string[]): CharIndexMap {
    const map: CharIndexMap = Object.create(null);
    for (let i = 0; i < charIndex.length; ++i) {
        const char = charIndex[i];
        map[char.normalize('NFC')] = i;
        map[char.normalize('NFD')] = i;
    }
    return map;
}
