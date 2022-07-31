import {
    createResponse,
    createResponseFail,
    isServiceResponseFailure,
    isServiceResponseSuccess,
    ServiceBus,
} from '@cspell/cspell-service-bus';
import assert from 'assert';
import { promises as fs, readFileSync, statSync } from 'fs';
import { gunzipSync, gzipSync } from 'zlib';
import { toError } from '../../errors';
import { fetchURL } from '../../node/file/fetch';
import { getStatHttp } from '../../node/file/stat';
import {
    RequestFsReadBinaryFile,
    RequestFsReadBinaryFileSync,
    RequestFsReadFile,
    RequestFsReadFileSync,
    RequestFsStat,
    RequestFsStatSync,
    RequestFsWriteFile,
    RequestZlibInflate,
} from '../../requests';

const isGzFileRegExp = /\.gz($|[?#])/;

function isGzFile(url: URL): boolean {
    return isGzFileRegExp.test(url.pathname);
}

/**
 * Handle Binary File Reads
 */
const handleRequestFsReadBinaryFile = RequestFsReadBinaryFile.createRequestHandler(
    ({ params }) => createResponse(fs.readFile(params.url).then((content) => ({ url: params.url, content }))),
    undefined,
    'Node: Read Binary File.'
);

/**
 * Handle Binary File Sync Reads
 */
const handleRequestFsReadBinaryFileSync = RequestFsReadBinaryFileSync.createRequestHandler(
    ({ params }) => createResponse({ url: params.url, content: readFileSync(params.url) }),
    undefined,
    'Node: Sync Read Binary File.'
);

/**
 * Handle UTF-8 Text File Reads
 */
const handleRequestFsReadFile = RequestFsReadFile.createRequestHandler(
    (req, _, dispatcher) => {
        const { url, encoding } = req.params;
        const res = dispatcher.dispatch(RequestFsReadBinaryFile.create({ url }));
        if (!isServiceResponseSuccess(res)) {
            assert(isServiceResponseFailure(res));
            return createResponseFail(req, res.error);
        }
        return createResponse(
            res.value.then((res) => ({
                url,
                content: bufferToText(res.content, encoding),
                baseFilename: res.baseFilename,
            }))
        );
    },
    undefined,
    'Node: Read Text File.'
);

/**
 * Handle UTF-8 Text File Reads
 */
const handleRequestFsReadFileSync = RequestFsReadFileSync.createRequestHandler(
    (req, _, dispatcher) => {
        const { url, encoding } = req.params;
        const res = dispatcher.dispatch(RequestFsReadBinaryFileSync.create({ url }));
        if (!isServiceResponseSuccess(res)) {
            assert(isServiceResponseFailure(res));
            return createResponseFail(req, res.error);
        }
        return createResponse({
            ...res.value,
            content: bufferToText(res.value.content, encoding),
        });
    },
    undefined,
    'Node: Sync Read Text File.'
);

/**
 * Handle deflating gzip data
 */
const handleRequestZlibInflate = RequestZlibInflate.createRequestHandler(
    ({ params }) => createResponse(gunzipSync(params.data).toString('utf-8')),
    undefined,
    'Node: gz deflate.'
);

const supportedFetchProtocols: Record<string, true | undefined> = { 'http:': true, 'https:': true };

/**
 * Handle reading gzip'ed text files.
 */
const handleRequestFsReadBinaryFileHttp = RequestFsReadBinaryFile.createRequestHandler(
    (req: RequestFsReadBinaryFile, next) => {
        const { url } = req.params;
        if (!(url.protocol in supportedFetchProtocols)) return next(req);
        return createResponse(fetchURL(url).then((content) => ({ url, content })));
    },
    undefined,
    'Node: Read Http(s) file.'
);

function bufferToText(buf: Buffer, encoding: BufferEncoding): string {
    return buf[0] === 0x1f && buf[1] === 0x8b ? bufferToText(gunzipSync(buf), encoding) : buf.toString(encoding);
}

/**
 * Handle fs:stat
 */
const handleRequestFsStat = RequestFsStat.createRequestHandler(
    ({ params }) => createResponse(fs.stat(params.url)),
    undefined,
    'Node: fs.stat.'
);

/**
 * Handle fs:statSync
 */
const handleRequestFsStatSync = RequestFsStatSync.createRequestHandler(
    (req) => {
        const { params } = req;
        try {
            return createResponse(statSync(params.url));
        } catch (e) {
            return createResponseFail(req, toError(e));
        }
    },
    undefined,
    'Node: fs.stat.'
);

/**
 * Handle deflating gzip data
 */
const handleRequestFsStatHttp = RequestFsStat.createRequestHandler(
    (req, next) => {
        const { url } = req.params;
        if (!(url.protocol in supportedFetchProtocols)) return next(req);
        return createResponse(getStatHttp(url));
    },
    undefined,
    'Node: http get stat'
);

/**
 * Handle fs:writeFile
 */
const handleRequestFsWriteFile = RequestFsWriteFile.createRequestHandler(
    ({ params }) => createResponse(fs.writeFile(params.url, params.content)),
    undefined,
    'Node: fs.writeFile'
);

/**
 * Handle fs:writeFile compressed
 */
const handleRequestFsWriteFileGz = RequestFsWriteFile.createRequestHandler(
    (req, next) => {
        const { url, content } = req.params;
        if (!isGzFile(url)) return next(req);
        return createResponse(fs.writeFile(url, gzipSync(content)));
    },
    undefined,
    'Node: http get stat'
);

export function registerHandlers(serviceBus: ServiceBus) {
    /**
     * Handlers are in order of low to high level
     * Order is VERY important.
     */
    const handlers = [
        handleRequestFsWriteFile,
        handleRequestFsWriteFileGz,
        handleRequestFsReadBinaryFile,
        handleRequestFsReadBinaryFileSync,
        handleRequestFsReadBinaryFileHttp,
        handleRequestFsReadFile,
        handleRequestFsReadFileSync,
        handleRequestZlibInflate,
        handleRequestFsStatSync,
        handleRequestFsStat,
        handleRequestFsStatHttp,
    ];

    handlers.forEach((handler) => serviceBus.addHandler(handler));
}