import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";

/**
 * POST /api/acontext/artifacts/batch-download
 * Generate a PDF file from images in selection order
 * 
 * Request body:
 * {
 *   urls: Array<{ url: string; filename: string }>
 * }
 * 
 * Response:
 * PDF file (application/pdf)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { urls } = body;

    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "urls must be a non-empty array",
        },
        { status: 400 }
      );
    }

    // Validate each URL entry
    for (const item of urls) {
      if (!item.url || typeof item.url !== "string") {
        return NextResponse.json(
          {
            success: false,
            error: "Each item must have a valid 'url' string",
          },
          { status: 400 }
        );
      }
      if (!item.filename || typeof item.filename !== "string") {
        return NextResponse.json(
          {
            success: false,
            error: "Each item must have a valid 'filename' string",
          },
          { status: 400 }
        );
      }
    }

    console.log("[API] POST /api/acontext/artifacts/batch-download: Processing PDF generation", {
      count: urls.length,
    });

    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle("Slides");
    pdfDoc.setAuthor("Acontext Agent");
    pdfDoc.setProducer("Acontext");

    // A4 landscape in points (72dpi)
    const PAGE_W = 842;
    const PAGE_H = 595;

    const errors: Array<{ url: string; filename: string; error: string }> = [];
    let pagesAdded = 0;

    const origin = request.nextUrl.origin;

    // Process each URL in order (maintains selection order)
    for (const item of urls) {
      try {
        const { url, filename } = item;

        // Normalize to absolute URL for Node/server fetch
        const fetchUrl =
          typeof url === "string" && url.startsWith("/")
            ? `${origin}${url}`
            : url;

        console.log("[API] batch-download: Fetching image for PDF", {
          url: fetchUrl.substring(0, 100) + "...",
          filename,
        });

        // Fetch the image from the public URL
        const response = await fetch(fetchUrl, {
          headers: {
            Accept: "image/*",
            "Accept-Encoding": "identity",
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Get content type from response headers
        const contentType = response.headers.get("content-type") || "image/png";

        // Check if it's actually an image
        if (!contentType.startsWith("image/")) {
          throw new Error(`Not an image: ${contentType}`);
        }

        // Convert to buffer
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // pdf-lib supports JPG/PNG embeds; convert other formats to PNG
        const isJpeg =
          contentType === "image/jpeg" ||
          contentType === "image/jpg" ||
          filename.toLowerCase().endsWith(".jpg") ||
          filename.toLowerCase().endsWith(".jpeg");
        const isPng =
          contentType === "image/png" || filename.toLowerCase().endsWith(".png");

        const embedBytes =
          isJpeg || isPng ? buffer : await sharp(buffer).png().toBuffer();
        const embeddedImage = isJpeg
          ? await pdfDoc.embedJpg(embedBytes)
          : await pdfDoc.embedPng(embedBytes);

        // Add a PDF page and draw the image centered, preserving aspect ratio
        const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
        const imgW = embeddedImage.width;
        const imgH = embeddedImage.height;
        const scale = Math.min(PAGE_W / imgW, PAGE_H / imgH);
        const drawW = imgW * scale;
        const drawH = imgH * scale;
        const x = (PAGE_W - drawW) / 2;
        const y = (PAGE_H - drawH) / 2;

        page.drawImage(embeddedImage, { x, y, width: drawW, height: drawH });
        pagesAdded += 1;

        console.log("[API] batch-download: Added PDF page", {
          filename,
          size: buffer.length,
          mimeType: contentType,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("[API] batch-download: Failed to add image", {
          url: item.url.substring(0, 100) + "...",
          filename: item.filename,
          error: errorMessage,
        });

        errors.push({
          url: item.url,
          filename: item.filename,
          error: errorMessage,
        });
      }
    }

    if (pagesAdded === 0) {
      console.error("[API] batch-download: No images could be added to PDF", {
        totalRequested: urls.length,
        errorCount: errors.length,
      });

      return NextResponse.json(
        {
          success: false,
          error:
            "No valid images could be added to the PDF. Please try regenerating slides or refreshing the page.",
        },
        { status: 422 }
      );
    }

    // Generate the PDF file
    const pdfBytes = await pdfDoc.save();

    console.log("[API] POST /api/acontext/artifacts/batch-download: PDF generated", {
      pageCount: pagesAdded,
      errorCount: errors.length,
      fileSize: pdfBytes.length,
    });

    // Return the PDF file
    return new NextResponse(new Uint8Array(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="your_slides.pdf"`,
        ...(errors.length > 0 && {
          "X-Errors": JSON.stringify(errors),
        }),
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    console.error("[API] Failed to generate PDF:", error);

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

