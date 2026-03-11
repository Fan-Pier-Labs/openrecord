import fs from 'fs';
import XLSX from 'xlsx';
import { BillingDetails } from './types';

/**
 * A flattened row for Excel that includes some top-level
 * visit data plus coverage info.
 */
interface ExcelRow {
  VisitIndex: number;
  BillingSystemDisplay: string;
  StartDateDisplay: string | null;
  Description: string | null;
  Patient: string | null;
  Provider: string | null;
  HospitalAccountDisplay: string | null;
  PrimaryPayer: string | null;
  ChargeAmount: string | null;
  InsuranceAmountDue: string | null;
  SelfAmountDue: string | null;
  InsurancePaymentAmount: string | null;
  SelfPaymentAmount: string | null;

  // Coverage details (only the first coverage in CoverageInfoList for demo)
  CoverageName?: string;
  CoverageBilled?: string;
  CoverageCovered?: string | null;
  CoverageRemainingResponsibility?: string | null;
  CoverageCopay?: string | null;
  CoverageDeductible?: string | null;
  CoverageCoinsurance?: string | null;
}


/**
 * Convert the raw JSON into an array of rows (one per visit).
 * If a visit has multiple coverage entries (CoverageInfoList),
 * you may either flatten them all or just pick the first one (as shown).
 */
function transformDataToExcelRows(massiveData: BillingDetails): ExcelRow[] {
  const visits = massiveData.Data.UnifiedVisitList ?? [];

  const rows: ExcelRow[] = visits.map((visit) => {
    // For demo, we’ll just grab the *first* coverage (if it exists):
    const firstCoverage = visit.CoverageInfoList && visit.CoverageInfoList.length > 0
      ? visit.CoverageInfoList[0]
      : undefined;

    return {
      VisitIndex: visit.Index,
      BillingSystemDisplay: visit.BillingSystemDisplay,
      StartDateDisplay: visit.StartDateDisplay,
      Description: visit.Description,
      Patient: visit.Patient,
      Provider: visit.Provider,
      HospitalAccountDisplay: visit.HospitalAccountDisplay,
      PrimaryPayer: visit.PrimaryPayer,
      ChargeAmount: visit.ChargeAmount,
      InsuranceAmountDue: visit.InsuranceAmountDue,
      SelfAmountDue: visit.SelfAmountDue,
      InsurancePaymentAmount: visit.InsurancePaymentAmount,
      SelfPaymentAmount: visit.SelfPaymentAmount,

      // Coverage details
      CoverageName: firstCoverage?.CoverageName,
      CoverageBilled: firstCoverage?.Billed,
      CoverageCovered: firstCoverage?.Covered,
      CoverageRemainingResponsibility: firstCoverage?.RemainingResponsibility,
      CoverageCopay: firstCoverage?.Copay,
      CoverageDeductible: firstCoverage?.Deductible,
      CoverageCoinsurance: firstCoverage?.Coinsurance,
    };
  });

  return rows;
}


/**
 * Reads the existing Excel file (if it exists), extracts rows from the "Visits" sheet,
 * and returns them as an array of objects. If the file or sheet doesn't exist, returns an empty array.
 */
function readExistingRows(outputFilePath: string, sheetName: string = 'Visits'): ExcelRow[] {
  if (!fs.existsSync(outputFilePath)) {
    // File doesn't exist yet
    return [];
  }

  // Read the existing workbook
  const workbook = XLSX.readFile(outputFilePath);

  // Check if sheet exists
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    return [];
  }

  // Convert worksheet to JSON
  // "raw: false" => formatted strings; could be raw values if you prefer
  const existingData = XLSX.utils.sheet_to_json<ExcelRow>(worksheet, { raw: false });
  return existingData;
}

function getPrimaryKeyFromRow(row: ExcelRow): string {

  // Usually HospitalAccountDisplay can be used as a primary key. some mycharts ddon't have that though, so we use some other fields instead. 
  const key = (row.VisitIndex ?? '') + (row.HospitalAccountDisplay ?? '') + (row.Description ?? '') + (row.StartDateDisplay ?? '') + (row.Provider ?? '')
  console.log('key:',key)
  return key
}

/**
 * Creates (or updates) an Excel file containing rows for visits. 
 * - Only adds new visits that are not already in the sheet (based on HospitalAccountDisplay).
 * - Afterwards, attempts to open the Excel file locally.
 */
export async function updateExcelFileWithBillingDetails(parsedJson: BillingDetails, outputFilePath: string): Promise<void> {

  // 2. Transform the data into new rows
  const newRows = transformDataToExcelRows(parsedJson);

  // 3. Read any existing rows from the Excel file (if it exists)
  const existingRows = readExistingRows(outputFilePath, 'Visits');

  // 4. Build a Set of existing HospitalAccountDisplays (our "primary key")
  const existingKeys = new Set<string | null>(
    existingRows.map((row) => getPrimaryKeyFromRow(row))
  );

  // 5. Filter out any new rows that are already present based on that key
  const filteredNewRows = newRows.filter(
    (row) => getPrimaryKeyFromRow(row) && !existingKeys.has(getPrimaryKeyFromRow(row))
  );

  if (filteredNewRows.length === 0) {
    console.log('No new rows to add. All visits already exist in the sheet.');
  } else {
    console.log(`Adding ${filteredNewRows.length} new rows to the Excel sheet...`);
  }

  // 6. Combine existing + newly filtered rows
  const combinedRows = [...existingRows, ...filteredNewRows];


  // 6.1 Sort combined rows by StartDatedisplay (assuming it is a valid date string)
  combinedRows.sort((a, b) => {
    // Handle cases where the field might be empty or invalid
    const dateA = a.StartDateDisplay ? new Date(a.StartDateDisplay).getTime() : 0;
    const dateB = b.StartDateDisplay ? new Date(b.StartDateDisplay).getTime() : 0;
    return dateB - dateA ; // descending order
  });


  // 7. Convert combined data back to a worksheet
  const worksheet = XLSX.utils.json_to_sheet(combinedRows);

  // Auto-adjust column widths based on content
  const maxWidths: { [key: string]: number } = {};
  
  // Get all column headers
  const headers = Object.keys(combinedRows[0] || {});
  
  // Initialize with header lengths
  headers.forEach(header => {
    maxWidths[header] = header.length;
  });

  // Find maximum width needed for each column
  combinedRows.forEach(row => {
    headers.forEach(header => {

      const cellValue = row[header as keyof ExcelRow];
      if (cellValue !== null && cellValue !== undefined) {
        const cellLength = String(cellValue).length;
        maxWidths[header] = Math.max(maxWidths[header], cellLength);
      }
    });
  });

  // Set column widths in the worksheet
  worksheet['!cols'] = headers.map(header => ({
    wch: Math.min(maxWidths[header] + 2, 50) // Add 2 for padding, cap at 50 characters
  }));

  // 8. Create a new workbook (or we could re-use the existing one, 
  //    but simpler to just create fresh and re-write "Visits" sheet)
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Visits');

  // 9. Write the Excel file to disk
  XLSX.writeFile(workbook, outputFilePath);

  console.log(`Excel file updated at: ${outputFilePath}`);
}