// Each bank fixture copies the real export's shape (header, delimiter,
// encoding, amount and date format) with made-up rows.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  decodeBytes, extractFromText, extractFromRows, parseAmount, storeLabel, mergeResults, findDates,
} from '../site/lib/parse.js';
import { readXlsx } from '../site/lib/xlsx.js';
import { dayNumber, toISO } from '../site/lib/dates.js';

const TODAY = dayNumber(2026, 11, 20);
const rows = (result) => result.transactions.map((t) => [toISO(t.date), t.kr, t.refund, t.store]);
const fixture = (name) => readFileSync(new URL(`fixtures/${name}`, import.meta.url));

test('parseAmount reads Swedish, English and SEB amounts', () => {
  assert.equal(parseAmount('-1 952,80'), -1952.8);
  assert.equal(parseAmount('-1 234,56 kr'), -1234.56);
  assert.equal(parseAmount('16&nbsp;200,00'), 16200);
  assert.equal(parseAmount('−389,00'), -389);
  assert.equal(parseAmount('1.234,50'), 1234.5);
  assert.equal(parseAmount('-1,234.50'), -1234.5);
  assert.equal(parseAmount('(389.00)'), -389);
  assert.equal(parseAmount('389,00-'), -389);
  assert.equal(parseAmount('-62.400'), -62.4);
  assert.equal(parseAmount('20.000'), 20);
  assert.equal(parseAmount('-120.00'), -120);
  assert.equal(parseAmount('SYSTEMBOLAGET'), null);
  assert.equal(parseAmount('1404 389,00'), null);
});

test('findDates ignores words that start like a month', () => {
  assert.deepEqual(findDates('1 MARIEBERG').map((d) => d.n), []);
  assert.deepEqual(findDates('2 JULA').map((d) => d.n), []);
  assert.deepEqual(findDates('14 nov 2026').map((d) => toISO(d.n)), ['2026-11-14']);
});

test('storeLabel cleans up what each bank writes', () => {
  assert.equal(storeLabel('Kortköp 261114 SYSTEMBOLAGET 1404 MALMÖ'), 'Systembolaget 1404 Malmö');
  assert.equal(storeLabel('SYSTEMBOLAGE/23-08-18'), 'Systembolaget');
  assert.equal(storeLabel('Systembolaget,MALMOe,SE'), 'Systembolaget Malmö');
  assert.equal(storeLabel('Systembolaget,NOeDINGE,SE'), 'Systembolaget Nödinge');
  assert.equal(storeLabel('SYSTEMBOLAGET MA'), 'Systembolaget');
  assert.equal(storeLabel('SYSTEMBOLAGET AB'), 'Systembolaget');
  assert.equal(storeLabel('Systembolaget'), 'Systembolaget');
});

test('Swedbank: Windows-1252 CSV with a preamble, purchase date from Transaktionsdag', () => {
  const text = [
    '* Transaktioner Period 2026-01-01–2026-11-19 Skapad 2026-11-19 14:57 CET',
    'Radnummer,Clearingnummer,Kontonummer,Produkt,Valuta,Bokföringsdag,Transaktionsdag,Valutadag,Referens,Beskrivning,Belopp,Bokfört saldo',
    '1,"8327-9","123456789","Privatkonto","SEK","2026-11-16","2026-11-14","2026-11-14","SYSTEMBOLAGET MA","Kortköp/uttag","-389.00","12345.67"',
    '2,"8327-9","123456789","Privatkonto","SEK","2026-11-16","2026-11-15","2026-11-15","ICA NARA","Kortköp/uttag","-129.50","12734.67"',
    '3,"8327-9","123456789","Privatkonto","SEK","2026-06-22","2026-06-18","2026-06-18","SYSTEMBOLAGET","SYSTEMBOLAGET","-1249.00","9000.00"',
  ].join('\r\n');
  // Encode as Windows-1252: ö is 0xF6 and the en dash 0x96.
  const bytes = Uint8Array.from([...text].map((ch) => (ch === '–' ? 0x96 : ch.charCodeAt(0))));
  const decoded = decodeBytes(bytes);
  assert.match(decoded, /Bokföringsdag/);
  const result = extractFromText(decoded, { today: TODAY });
  assert.deepEqual(rows(result), [
    ['2026-06-18', 1249, false, 'Systembolaget'],
    ['2026-11-14', 389, false, 'Systembolaget'],
  ]);
  assert.equal(toISO(result.coverage.from), '2026-01-01');
});

test('SEB: three-decimal amounts and the purchase date inside the text', () => {
  const text = [
    '﻿Bokföringsdatum;Valutadatum;Verifikationsnummer;Text;Belopp;Saldo',
    '2026-08-24;2026-08-22;5490990003;SYSTEMBOLAGE/26-08-21;-312.900;10487.100',
    '2026-08-24;2026-08-23;5490990004;ICA NARA/26-08-22;-62.400;10800.000',
    '2026-08-25;2026-08-25;5490990005;LÖN;20000.000;10862.400',
  ].join('\n');
  const result = extractFromText(decodeBytes(new TextEncoder().encode(text)), { today: TODAY });
  assert.deepEqual(rows(result), [['2026-08-21', 312.9, false, 'Systembolaget']]);
});

test('Nordea: Kortköp dates, pending rows and refunds', () => {
  const text = [
    '﻿Bokföringsdag;Belopp;Avsändare;Mottagare;Namn;Rubrik;Saldo;Valuta;',
    'Reserverat;-219,00;;;;Reservation Kortköp 261118 SYSTEMBOLAGET 1404;;SEK;',
    '2026/11/16;-449,00;1234 56 78901;;;Kortköp 261114 SYSTEMBOLAGET 1404;5000,00;SEK;',
    '2026/11/12;89,00;;1234 56 78901;;Återköp 261110 SYSTEMBOLAGET 1404;5449,00;SEK;',
    '2026/11/10;-89,00;1234 56 78901;;;Kortköp 261107 SYSTEMBOLAGET 1404;5360,00;SEK;',
    '2026/11/09;-35,00;1234 56 78901;;;Kortköp 261108 PRESSBYRAN;5449,00;SEK;',
  ].join('\n');
  const result = extractFromText(text, { today: TODAY });
  assert.deepEqual(rows(result), [
    ['2026-11-07', 89, false, 'Systembolaget 1404'],
    ['2026-11-10', 89, true, 'Systembolaget 1404'],
    ['2026-11-14', 449, false, 'Systembolaget 1404'],
    ['2026-11-18', 219, false, 'Systembolaget 1404'],
  ]);
});

test('Länsförsäkringar: account table, blank row, then quoted transactions', () => {
  const text = [
    '"Kontonummer";"Kontonamn";"";"Saldo";"Tillgängligt belopp"',
    '"90240000000";"Privatkonto";"";"9 999,99";"9 999,99"',
    '',
    '"Bokföringsdatum";"Transaktionsdatum";"Transaktionstyp";"Meddelande";"Belopp"',
    '"2026-06-22";"2026-06-18";"Kortköp";"Systembolaget,MALMOe,SE";"-1 952,80"',
    '"2026-06-22";"2026-06-19";"Kortköp";"Willys,MALMOe,SE";"-412,00"',
    '"2026-04-02";"2026-04-01";"Kortköp";"Systembolaget,NOeDINGE,SE";"-299,00"',
  ].join('\n');
  assert.deepEqual(rows(extractFromText(text, { today: TODAY })), [
    ['2026-04-01', 299, false, 'Systembolaget Nödinge'],
    ['2026-06-18', 1952.8, false, 'Systembolaget Malmö'],
  ]);
});

test('Länsförsäkringar re-saved by a spreadsheet: commas, CRLF and a ,,,, separator', () => {
  const text = [
    'Kontonummer,Kontonamn,,Saldo,Tillgängligt belopp',
    '90240000000,Privatkonto,,"9 999,99","9 999,99"',
    ',,,,',
    'Bokföringsdatum,Transaktionsdatum,Transaktionstyp,Meddelande,Belopp',
    '2026-06-22,2026-06-18,Kortköp,"Systembolaget,MALMOe,SE","-1 952,80"',
    '2026-06-22,2026-06-19,Kortköp,"Willys,MALMOe,SE","-412,00"',
  ].join('\r\n');
  assert.deepEqual(rows(extractFromText(text, { today: TODAY })), [['2026-06-18', 1952.8, false, 'Systembolaget Malmö']]);
});

test('ICA Banken: kr suffix and reserved amounts', () => {
  const text = [
    'Datum;Text;Typ;Budgetgrupp;Belopp;Saldo',
    '2026-09-25;Systembolaget;Korttransaktion;Övrigt;-1 234,56 kr;8 000,00 kr',
    '2026-09-26;Systembolaget;Reserverat belopp;Övrigt;-200,00 kr;',
  ].join('\n');
  assert.deepEqual(rows(extractFromText(text, { today: TODAY })), [
    ['2026-09-25', 1234.56, false, 'Systembolaget'],
    ['2026-09-26', 200, false, 'Systembolaget'],
  ]);
});

test('Revolut: English headers, times, reverted payments skipped', () => {
  const text = [
    'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
    'CARD_PAYMENT,Current,2026-05-29 16:42:10,2026-05-30 08:00:00,Systembolaget,-245.00,0.00,SEK,COMPLETED,1000.00',
    'CARD_PAYMENT,Current,2026-05-30 11:05:00,,Systembolaget,-99.00,0.00,SEK,REVERTED,',
    'CARD_PAYMENT,Current,2026-06-05 17:15:00,2026-06-06 08:00:00,Systembolaget,-310.00,0.00,SEK,COMPLETED,690.00',
    'TOPUP,Current,2026-06-01 09:00:00,2026-06-01 09:00:00,Top-Up,500.00,0.00,SEK,COMPLETED,1190.00',
  ].join('\n');
  const result = extractFromText(text, { today: TODAY });
  assert.deepEqual(rows(result), [
    ['2026-05-29', 245, false, 'Systembolaget'],
    ['2026-06-05', 310, false, 'Systembolaget'],
  ]);
  assert.deepEqual(result.transactions.map((t) => t.time), ['16:42', '17:15']);
});

test('Amex: month-first dates and positive purchases', () => {
  const text = [
    'Datum,Beskrivning,Kortmedlem,Konto #,Belopp,Utökade specifikationer,Visas på ditt kontoutdrag som,Adress,Ort,Postnummer,Land,Referens',
    '11/20/2026,SYSTEMBOLAGET 1404,K KUND,-11005,"109,05",,SYSTEMBOLAGET 1404,STORGATAN 1,MALMO,21134,SVERIGE,\'320263240000000000\'',
    '03/04/2026,SYSTEMBOLAGET 1404,K KUND,-11005,"412,00",,SYSTEMBOLAGET 1404,STORGATAN 1,MALMO,21134,SVERIGE,\'320260630000000000\'',
    '03/05/2026,BETALNING MOTTAGEN,K KUND,-11005,"-5000,00",,,,,,,\'320260640000000000\'',
  ].join('\n');
  assert.deepEqual(rows(extractFromText(text, { today: TODAY })), [
    ['2026-03-04', 412, false, 'Systembolaget 1404'],
    ['2026-11-20', 109.05, false, 'Systembolaget 1404'],
  ]);
});

test('SEB Kort: repeated section headers, summary rows ignored', () => {
  const text = [
    'Datum,Bokfört,Specifikation,Ort,Valuta,Utl. belopp,Belopp',
    '2026-10-02,2026-10-05,SYSTEMBOLAGET,MALMO,SEK,,"349,00"',
    '2026-10-03,2026-10-05,COOP,MALMO,SEK,,"129,00"',
    'Summa köp/uttag,,,,,,"478,00"',
    '',
    'Datum,Bokfört,Specifikation,Ort,Valuta,Utl. belopp,Belopp',
    '2026-10-09,2026-10-12,SYSTEMBOLAGET,LUND,SEK,,"219,00"',
    'Totalt belopp,,,,,,"697,00"',
  ].join('\n');
  assert.deepEqual(rows(extractFromText(text, { today: TODAY })), [
    ['2026-10-02', 349, false, 'Systembolaget'],
    ['2026-10-09', 219, false, 'Systembolaget'],
  ]);
});

test('Handelsbanken .xlsx: preamble, text dates, pending row, styled serial date', async () => {
  const result = extractFromRows(await readXlsx(fixture('handelsbanken.xlsx')), { today: TODAY });
  assert.deepEqual(rows(result), [
    ['2026-02-27', 1549, false, 'Systembolaget'],
    ['2026-11-14', 389, false, 'Systembolaget'],
    ['2026-11-17', 99.5, false, 'Systembolaget'],
  ]);
});

test('Skandia-shaped .xlsx: two-line headers and bare serial dates', async () => {
  const result = extractFromRows(await readXlsx(fixture('skandia.xlsx')), { today: TODAY });
  assert.deepEqual(rows(result), [['2026-07-03', 579, false, 'Systembolaget 1404']]);
});

test('pasted from a web table: tabs, balance after the amount, date in the text', () => {
  const text = '2026-11-14\tKortköp 261113 SYSTEMBOLAGET 1404 MALMÖ\t-389,00\t12 345,67\n2026-11-14\tICA NARA\t-129,00\t12 734,67';
  assert.deepEqual(rows(extractFromText(text, { today: TODAY })), [['2026-11-13', 389, false, 'Systembolaget 1404 Malmö']]);
});

test('pasted from an app: one field per line, dates without a year', () => {
  const text = ['Idag', '14 nov', 'SYSTEMBOLAGET 1404', '-389,00 kr', 'Saldo 12 345,67 kr', '13 nov', 'ICA NARA', '-129,00 kr'].join('\n');
  assert.deepEqual(rows(extractFromText(text, { today: TODAY })), [['2026-11-14', 389, false, 'Systembolaget 1404']]);
});

test('pasted Danske-style line: dot thousands and a contactless marker', () => {
  const text = '2026-11-14 SYSTEMBOLAGET 1404 )))) -1.389,00 7.650,02\n2026-11-13 COOP )))) -99,00 9.039,02';
  assert.deepEqual(rows(extractFromText(text, { today: TODAY })), [['2026-11-14', 1389, false, 'Systembolaget 1404']]);
});

test('mergeResults drops overlapping exports but keeps real twins', () => {
  const text = [
    'Datum;Text;Belopp',
    '2026-11-14;SYSTEMBOLAGET 1404;-129,00',
    '2026-11-14;SYSTEMBOLAGET 1404;-129,00',
    '2026-11-21;SYSTEMBOLAGET 1404;-89,00',
  ].join('\n');
  const a = extractFromText(text, { today: TODAY });
  const b = extractFromText(text.split('\n').slice(0, 2).join('\n'), { today: TODAY });
  const merged = mergeResults([a, b, a]);
  assert.equal(merged.transactions.length, 3);
});

test('a file without Systembolaget finds nothing but still counts rows', () => {
  const result = extractFromText('Datum;Text;Belopp\n2026-11-14;ICA NARA;-129,00\n2026-11-15;SL;-39,00', { today: TODAY });
  assert.equal(result.transactions.length, 0);
  assert.equal(result.rowsWithDates, 2);
});
