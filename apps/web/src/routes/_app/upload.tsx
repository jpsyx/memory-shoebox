import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/system/Chrome";
import { Lede, Prose } from "@/system/typography";

export const Route = createFileRoute("/_app/upload")({
  component: UploadPage,
});

function UploadPage() {
  return (
    <Page wide>
      <Lede>Put a batch up.</Lede>
      <Prose onPanel>
        Surface 8, where the product's promise lives. Built in step 7b,
        against the upload session step 6a delivers.
      </Prose>
    </Page>
  );
}
