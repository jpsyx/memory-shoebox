/**
 * The response headers a signed read may override, by the query parameter
 * that asks for each. `presignGet` signs `response-cache-control` into every
 * read URL and `response-content-disposition` into a download's, and S3 sends
 * each back as the header it names, so the stand-in must too: a browser acts
 * on both.
 */
export const RESPONSE_HEADER_BY_PARAMETER: Readonly<Record<string, string>> = {
  "response-cache-control": "Cache-Control",
  "response-content-disposition": "Content-Disposition",
};

/** S3's floor for every part but the last. */
export const MINIMUM_PART_BYTES = 5 * 1024 * 1024;

/** The namespace every S3 XML document carries. */
export const S3_NAMESPACE = "http://s3.amazonaws.com/doc/2006-03-01/";
