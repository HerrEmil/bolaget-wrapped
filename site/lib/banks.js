// Which file each bank gives you, from the formats the parser was tested
// against. Menu names change, so this says what to look for, not where.

export const BANKS = [
  { name: 'Swedbank och sparbankerna', how: 'Exportera kontots transaktioner som CSV-fil. Excel-filen går också bra.' },
  { name: 'Handelsbanken', how: 'Exportera kontotransaktionerna till Excel. Både dagens .xlsx-filer och de äldre .xls-filerna går att läsa.' },
  { name: 'SEB', how: 'Välj Spara kontohändelser och spara som CSV eller Excel.' },
  { name: 'Nordea', how: 'Exportera transaktionerna med knappen CSV (Excel).' },
  { name: 'Länsförsäkringar', how: 'Ladda ner kontots transaktioner som CSV-fil.' },
  { name: 'ICA Banken', how: 'Exportera transaktionerna som CSV-fil om det går. Annars: markera raderna, kopiera och klistra in dem här.' },
  { name: 'Skandia', how: 'Exportera transaktionerna till Excel.' },
  { name: 'Danske Bank', how: 'Markera transaktionerna i internetbanken, kopiera dem och klistra in dem här.' },
  { name: 'Revolut', how: 'Ladda ner ett kontoutdrag som CSV.' },
  { name: 'American Express', how: 'Ladda ner kortets transaktioner som CSV-fil.' },
  { name: 'SEB Kort (Eurocard, SAS EuroBonus Mastercard)', how: 'Exportera kortets transaktioner till Excel.' },
  { name: 'Övriga banker och kort', how: 'Leta efter Exportera, Ladda ner eller Excel bland kontots transaktioner och välj CSV eller Excel. Hittar du inget kan du markera transaktionerna, kopiera dem och klistra in dem här.' },
];
