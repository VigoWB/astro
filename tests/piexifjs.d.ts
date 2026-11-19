// Paczka piexifjs nie ma własnych typów. Ta deklaracja pozwala zaimportować ją w teście EXIF-u
// (tests/integracyjne/sync-images.test.ts) bez nowej zależności @types/piexifjs — typ modułu to any.
declare module "piexifjs";
