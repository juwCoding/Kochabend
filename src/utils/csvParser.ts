import Papa from "papaparse";

export interface ParseCSVOptions {
  hasHeader: boolean;
  onComplete: (data: string[][]) => void;
  onError: (error: Error) => void;
}

export function parseCSVFile(
  file: File,
  options: ParseCSVOptions
): void {
  Papa.parse(file, {
    header: false,
    skipEmptyLines: true,
    complete: (results) => {
      if (results.errors.length > 0) {
        options.onError(new Error(results.errors[0].message));
        return;
      }
      
      let data = results.data as string[][];
      
      // Remove header if specified
      if (options.hasHeader && data.length > 0) {
        data = data.slice(1);
      }
      
      options.onComplete(data);
    },
    error: (error) => {
      options.onError(new Error(error.message));
    },
  });
}

export function parseCSVText(
  text: string,
  hasHeader: boolean
): string[][] {
  const results = Papa.parse(text, {
    header: false,
    skipEmptyLines: true,
  });
  
  let data = results.data as string[][];
  
  if (hasHeader && data.length > 0) {
    data = data.slice(1);
  }
  
  return data;
}

