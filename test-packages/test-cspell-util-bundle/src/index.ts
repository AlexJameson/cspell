import { assert } from 'console';
import * as lib from 'cspell-util-bundle';

/**
 * The main goal here is to make sure it compiles. The unit tests are validation that it compiled as expected.
 */
const functions = [lib.xregexp];
functions.forEach((fn) => assert(typeof fn === 'function', "typeof %o === 'function'", fn));
