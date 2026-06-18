/**
 * gen-fixtures.mjs — run once after `npm install` to generate binary test fixtures.
 * Usage: node packages/core/src/sources/__tests__/fixtures/gen-fixtures.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// PDF fixture — generated via PDFKit (produces a spec-compliant PDF)
// ---------------------------------------------------------------------------

async function buildPDF() {
  const { default: PDFDocument } = await import('pdfkit');
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.text('Hello World');
    doc.end();
  });
}

// ---------------------------------------------------------------------------
// DOCX fixture — minimal DOCX using JSZip
// ---------------------------------------------------------------------------

async function buildDOCX(JSZip) {
  const zip = new JSZip();

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

  zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  zip.folder('word').file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Sample DOCX document for testing</w:t></w:r></w:p>
  </w:body>
</w:document>`);

  zip.folder('word/_rels').file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`);

  return zip.generateAsync({ type: 'nodebuffer' });
}

// ---------------------------------------------------------------------------
// EPUB fixture — minimal EPUB using JSZip
// ---------------------------------------------------------------------------

async function buildEPUB(JSZip) {
  const zip = new JSZip();

  // mimetype must be first and STORE (not deflated)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  zip.folder('META-INF').file('container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  zip.file('content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Sample EPUB</dc:title>
    <dc:identifier id="bookid">sample-epub-001</dc:identifier>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="chapter1" href="chapter1.html" media-type="application/xhtml+xml"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="chapter1"/>
  </spine>
</package>`);

  zip.file('toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="sample-epub-001"/></head>
  <docTitle><text>Sample EPUB</text></docTitle>
  <navMap>
    <navPoint id="navpoint-1" playOrder="1">
      <navLabel><text>Chapter 1</text></navLabel>
      <content src="chapter1.html"/>
    </navPoint>
  </navMap>
</ncx>`);

  zip.file('chapter1.html', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Chapter 1</title></head>
  <body>
    <h1>Chapter One</h1>
    <p>Sample EPUB content for testing purposes.</p>
  </body>
</html>`);

  return zip.generateAsync({ type: 'nodebuffer' });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(__dirname, { recursive: true });

  // PDF
  const pdfBuf = await buildPDF();
  writeFileSync(join(__dirname, 'sample.pdf'), pdfBuf);
  console.log('sample.pdf written');

  // Load JSZip (transitive dep via epub2 or mammoth)
  let JSZip;
  try {
    const m = await import('jszip');
    JSZip = m.default;
  } catch (e) {
    console.error('JSZip not available:', e.message);
    process.exit(1);
  }

  // DOCX
  const docxBuf = await buildDOCX(JSZip);
  writeFileSync(join(__dirname, 'sample.docx'), docxBuf);
  console.log('sample.docx written');

  // EPUB
  const epubBuf = await buildEPUB(JSZip);
  writeFileSync(join(__dirname, 'sample.epub'), epubBuf);
  console.log('sample.epub written');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
