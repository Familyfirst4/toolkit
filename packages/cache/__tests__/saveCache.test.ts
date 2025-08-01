import * as core from '@actions/core'
import * as path from 'path'
import {saveCache} from '../src/cache'
import * as cacheHttpClient from '../src/internal/cacheHttpClient'
import * as cacheUtils from '../src/internal/cacheUtils'
import * as config from '../src/internal/config'
import {CacheFilename, CompressionMethod} from '../src/internal/constants'
import * as tar from '../src/internal/tar'
import {TypedResponse} from '@actions/http-client/lib/interfaces'
import {HttpClientError} from '@actions/http-client'
import {
  ReserveCacheResponse,
  ITypedResponseWithError
} from '../src/internal/contracts'
import {CacheServiceClientJSON} from '../src/generated/results/api/v1/cache.twirp-client'

jest.mock('../src/internal/cacheHttpClient')
jest.mock('../src/internal/cacheUtils')
jest.mock('../src/internal/config')
jest.mock('../src/internal/tar')

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(core, 'debug').mockImplementation(() => {})
  jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(core, 'warning').mockImplementation(() => {})
  jest.spyOn(core, 'error').mockImplementation(() => {})
  jest.spyOn(cacheUtils, 'getCacheFileName').mockImplementation(cm => {
    const actualUtils = jest.requireActual('../src/internal/cacheUtils')
    return actualUtils.getCacheFileName(cm)
  })
  jest.spyOn(cacheUtils, 'resolvePaths').mockImplementation(async filePaths => {
    return filePaths.map(x => path.resolve(x))
  })
  jest.spyOn(cacheUtils, 'createTempDirectory').mockImplementation(async () => {
    return Promise.resolve('/foo/bar')
  })
})

test('save with missing input should fail', async () => {
  const paths: string[] = []
  const primaryKey = 'Linux-node-bb828da54c148048dd17899ba9fda624811cfb43'
  await expect(saveCache(paths, primaryKey)).rejects.toThrowError(
    `Path Validation Error: At least one directory or file path is required`
  )
})

test('save with large cache outputs should fail', async () => {
  const filePath = 'node_modules'
  const primaryKey = 'Linux-node-bb828da54c148048dd17899ba9fda624811cfb43'
  const cachePaths = [path.resolve(filePath)]

  const createTarMock = jest.spyOn(tar, 'createTar')
  const logWarningMock = jest.spyOn(core, 'warning')

  const cacheSize = 11 * 1024 * 1024 * 1024 //~11GB, over the 10GB limit
  jest
    .spyOn(cacheUtils, 'getArchiveFileSizeInBytes')
    .mockReturnValueOnce(cacheSize)
  const compression = CompressionMethod.Gzip
  const getCompressionMock = jest
    .spyOn(cacheUtils, 'getCompressionMethod')
    .mockReturnValueOnce(Promise.resolve(compression))

  const cacheId = await saveCache([filePath], primaryKey)
  expect(cacheId).toBe(-1)
  expect(logWarningMock).toHaveBeenCalledTimes(1)
  expect(logWarningMock).toHaveBeenCalledWith(
    'Failed to save: Cache size of ~11264 MB (11811160064 B) is over the 10GB limit, not saving cache.'
  )

  const archiveFolder = '/foo/bar'

  expect(createTarMock).toHaveBeenCalledTimes(1)
  expect(createTarMock).toHaveBeenCalledWith(
    archiveFolder,
    cachePaths,
    compression
  )
  expect(getCompressionMock).toHaveBeenCalledTimes(1)
})

test('save with large cache outputs should fail in GHES with error message', async () => {
  const filePath = 'node_modules'
  const primaryKey = 'Linux-node-bb828da54c148048dd17899ba9fda624811cfb43'
  const cachePaths = [path.resolve(filePath)]

  const createTarMock = jest.spyOn(tar, 'createTar')
  const logWarningMock = jest.spyOn(core, 'warning')

  const cacheSize = 11 * 1024 * 1024 * 1024 //~11GB, over the 10GB limit
  jest
    .spyOn(cacheUtils, 'getArchiveFileSizeInBytes')
    .mockReturnValueOnce(cacheSize)
  const compression = CompressionMethod.Gzip
  const getCompressionMock = jest
    .spyOn(cacheUtils, 'getCompressionMethod')
    .mockReturnValueOnce(Promise.resolve(compression))

  jest.spyOn(config, 'isGhes').mockReturnValueOnce(true)

  const reserveCacheMock = jest
    .spyOn(cacheHttpClient, 'reserveCache')
    .mockImplementation(async () => {
      const response: ITypedResponseWithError<ReserveCacheResponse> = {
        statusCode: 400,
        result: null,
        headers: {},
        error: new HttpClientError(
          'The cache filesize must be between 0 and 1073741824 bytes',
          400
        )
      }
      return response
    })

  const cacheId = await saveCache([filePath], primaryKey)
  expect(cacheId).toBe(-1)
  expect(logWarningMock).toHaveBeenCalledTimes(1)
  expect(logWarningMock).toHaveBeenCalledWith(
    'Failed to save: The cache filesize must be between 0 and 1073741824 bytes'
  )

  const archiveFolder = '/foo/bar'
  expect(reserveCacheMock).toHaveBeenCalledTimes(1)
  expect(createTarMock).toHaveBeenCalledTimes(1)
  expect(createTarMock).toHaveBeenCalledWith(
    archiveFolder,
    cachePaths,
    compression
  )
  expect(getCompressionMock).toHaveBeenCalledTimes(1)
})

test('save with large cache outputs should fail in GHES without error message', async () => {
  const filePath = 'node_modules'
  const primaryKey = 'Linux-node-bb828da54c148048dd17899ba9fda624811cfb43'
  const cachePaths = [path.resolve(filePath)]

  const createTarMock = jest.spyOn(tar, 'createTar')
  const logWarningMock = jest.spyOn(core, 'warning')

  const cacheSize = 11 * 1024 * 1024 * 1024 //~11GB, over the 10GB limit
  jest
    .spyOn(cacheUtils, 'getArchiveFileSizeInBytes')
    .mockReturnValueOnce(cacheSize)
  const compression = CompressionMethod.Gzip
  const getCompressionMock = jest
    .spyOn(cacheUtils, 'getCompressionMethod')
    .mockReturnValueOnce(Promise.resolve(compression))

  jest.spyOn(config, 'isGhes').mockReturnValueOnce(true)

  const reserveCacheMock = jest
    .spyOn(cacheHttpClient, 'reserveCache')
    .mockImplementation(async () => {
      const response: ITypedResponseWithError<ReserveCacheResponse> = {
        statusCode: 400,
        result: null,
        headers: {}
      }
      return response
    })

  const cacheId = await saveCache([filePath], primaryKey)
  expect(cacheId).toBe(-1)
  expect(logWarningMock).toHaveBeenCalledTimes(1)
  expect(logWarningMock).toHaveBeenCalledWith(
    'Failed to save: Cache size of ~11264 MB (11811160064 B) is over the data cap limit, not saving cache.'
  )

  const archiveFolder = '/foo/bar'
  expect(reserveCacheMock).toHaveBeenCalledTimes(1)
  expect(createTarMock).toHaveBeenCalledTimes(1)
  expect(createTarMock).toHaveBeenCalledWith(
    archiveFolder,
    cachePaths,
    compression
  )
  expect(getCompressionMock).toHaveBeenCalledTimes(1)
})

test('save with reserve cache failure should fail', async () => {
  const paths = ['node_modules']
  const primaryKey = 'Linux-node-bb828da54c148048dd17899ba9fda624811cfb43'
  const logInfoMock = jest.spyOn(core, 'info')

  const reserveCacheMock = jest
    .spyOn(cacheHttpClient, 'reserveCache')
    .mockImplementation(async () => {
      const response: TypedResponse<ReserveCacheResponse> = {
        statusCode: 500,
        result: null,
        headers: {}
      }
      return response
    })

  const createTarMock = jest.spyOn(tar, 'createTar')
  const saveCacheMock = jest.spyOn(cacheHttpClient, 'saveCache')
  const compression = CompressionMethod.Zstd
  const getCompressionMock = jest
    .spyOn(cacheUtils, 'getCompressionMethod')
    .mockReturnValueOnce(Promise.resolve(compression))

  const cacheId = await saveCache(paths, primaryKey)
  expect(cacheId).toBe(-1)
  expect(logInfoMock).toHaveBeenCalledTimes(1)
  expect(logInfoMock).toHaveBeenCalledWith(
    `Failed to save: Unable to reserve cache with key ${primaryKey}, another job may be creating this cache. More details: undefined`
  )

  expect(reserveCacheMock).toHaveBeenCalledTimes(1)
  expect(reserveCacheMock).toHaveBeenCalledWith(primaryKey, paths, {
    cacheSize: undefined,
    compressionMethod: compression,
    enableCrossOsArchive: false
  })
  expect(createTarMock).toHaveBeenCalledTimes(1)
  expect(saveCacheMock).toHaveBeenCalledTimes(0)
  expect(getCompressionMock).toHaveBeenCalledTimes(1)
})

test('save with server error should fail', async () => {
  const filePath = 'node_modules'
  const primaryKey = 'Linux-node-bb828da54c148048dd17899ba9fda624811cfb43'
  const logErrorMock = jest.spyOn(core, 'error')
  const logWarningMock = jest.spyOn(core, 'warning')

  // Mock cache service version to V2
  const getCacheServiceVersionMock = jest.spyOn(config, 'getCacheServiceVersion').mockReturnValue('v2')

  // Mock V2 CreateCacheEntry to succeed
  const createCacheEntryMock = jest
    .spyOn(CacheServiceClientJSON.prototype, 'CreateCacheEntry')
    .mockReturnValue(
      Promise.resolve({ok: true, signedUploadUrl: 'https://blob-storage.local?signed=true'})
    )

  // Mock the FinalizeCacheEntryUpload to succeed (since the error should happen in saveCache)
  const finalizeCacheEntryMock = jest
    .spyOn(CacheServiceClientJSON.prototype, 'FinalizeCacheEntryUpload')
    .mockReturnValue(Promise.resolve({ok: true, entryId: '4'}))

  const createTarMock = jest.spyOn(tar, 'createTar')

  // Mock the saveCache call to throw a server error
  const saveCacheMock = jest
    .spyOn(cacheHttpClient, 'saveCache')
    .mockImplementationOnce(() => {
      throw new HttpClientError('HTTP Error Occurred', 500)
    })

  const compression = CompressionMethod.Zstd
  const getCompressionMock = jest
    .spyOn(cacheUtils, 'getCompressionMethod')
    .mockReturnValueOnce(Promise.resolve(compression))

  await saveCache([filePath], primaryKey)
  
  expect(logErrorMock).toHaveBeenCalledTimes(1)
  expect(logErrorMock).toHaveBeenCalledWith(
    'Failed to save: HTTP Error Occurred'
  )

  expect(createCacheEntryMock).toHaveBeenCalledTimes(1)
  const archiveFolder = '/foo/bar'
  const cachePaths = [path.resolve(filePath)]
  const archiveFile = path.join(archiveFolder, CacheFilename.Zstd)
  expect(createTarMock).toHaveBeenCalledTimes(1)
  expect(createTarMock).toHaveBeenCalledWith(
    archiveFolder,
    cachePaths,
    compression
  )
  expect(saveCacheMock).toHaveBeenCalledTimes(1)
  expect(getCompressionMock).toHaveBeenCalledTimes(1)
  expect(getCompressionMock).toHaveBeenCalledTimes(1)
  
  // Restore the getCacheServiceVersion mock to its original state
  getCacheServiceVersionMock.mockRestore()
})

test('save with valid inputs uploads a cache', async () => {
  const filePath = 'node_modules'
  const primaryKey = 'Linux-node-bb828da54c148048dd17899ba9fda624811cfb43'
  const cachePaths = [path.resolve(filePath)]

  const cacheId = 4
  const reserveCacheMock = jest
    .spyOn(cacheHttpClient, 'reserveCache')
    .mockImplementation(async () => {
      const response: TypedResponse<ReserveCacheResponse> = {
        statusCode: 500,
        result: {cacheId},
        headers: {}
      }
      return response
    })
  const createTarMock = jest.spyOn(tar, 'createTar')

  const saveCacheMock = jest.spyOn(cacheHttpClient, 'saveCache')
  const compression = CompressionMethod.Zstd
  const getCompressionMock = jest
    .spyOn(cacheUtils, 'getCompressionMethod')
    .mockReturnValue(Promise.resolve(compression))

  await saveCache([filePath], primaryKey)

  expect(reserveCacheMock).toHaveBeenCalledTimes(1)
  expect(reserveCacheMock).toHaveBeenCalledWith(primaryKey, [filePath], {
    cacheSize: undefined,
    compressionMethod: compression,
    enableCrossOsArchive: false
  })
  const archiveFolder = '/foo/bar'
  const archiveFile = path.join(archiveFolder, CacheFilename.Zstd)
  expect(createTarMock).toHaveBeenCalledTimes(1)
  expect(createTarMock).toHaveBeenCalledWith(
    archiveFolder,
    cachePaths,
    compression
  )
  expect(saveCacheMock).toHaveBeenCalledTimes(1)
  expect(saveCacheMock).toHaveBeenCalledWith(
    cacheId,
    archiveFile,
    '',
    undefined
  )
  expect(getCompressionMock).toHaveBeenCalledTimes(1)
})

test('save with non existing path should not save cache', async () => {
  const path = 'node_modules'
  const primaryKey = 'Linux-node-bb828da54c148048dd17899ba9fda624811cfb43'
  jest.spyOn(cacheUtils, 'resolvePaths').mockImplementation(async () => {
    return []
  })
  await expect(saveCache([path], primaryKey)).rejects.toThrowError(
    `Path Validation Error: Path(s) specified in the action for caching do(es) not exist, hence no cache is being saved.`
  )
})
