import Papa from "papaparse";

export interface ParseCSVOptions {
  hasHeader: boolean;
  onComplete: (data: string[][]) => void;
  onError: (error: Error) => void;
}

/**
 * Decode CSV file bytes for German/Windows exports: UTF-8 (with optional BOM),
 * UTF-16 LE/BE (BOM), otherwise strict UTF-8 then Windows-1252 fallback.
 */
export function decodeCsvBytes(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder("windows-1252").decode(bytes);
    } catch {
      return new TextDecoder("utf-8").decode(bytes);
    }
  }
}

function parsePapaResults(
  results: Papa.ParseResult<string[]>,
  onComplete: (data: string[][]) => void,
  onError: (error: Error) => void
): void {
  if (results.errors.length > 0) {
    onError(new Error(results.errors[0].message));
    return;
  }

  const data = results.data as string[][];

  onComplete(data);
}

export function parseCSVFile(
  file: File,
  options: ParseCSVOptions
): void {
  void file
    .arrayBuffer()
    .then((buffer) => {
      const text = decodeCsvBytes(buffer);
      Papa.parse<string[]>(text, {
        header: false,
        skipEmptyLines: true,
        complete: (results) =>
          parsePapaResults(results, options.onComplete, options.onError),
        error: (error: Error) => {
          options.onError(new Error(error.message));
        },
      });
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      options.onError(new Error(message));
    });
}

export function parseCSVText(
  text: string
): string[][] {
  const results = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: true,
  });

  if (results.errors.length > 0) {
    throw new Error(results.errors[0].message);
  }

  const data = results.data as string[][];

  return data;
}

