import { Button, Group, Modal, Slider, Stack, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import type { ReactNode } from "react";
import type { AvatarCrop } from "@memory-shoebox/shared";
import { getPreviewFromAvatarCrop } from "../avatarCropHelpers/avatarCropHelpers";
import classes from "./AvatarCropDialog.module.css";

type Props = {
  opened: boolean;
  url: string;
  dimensions: { width: number; height: number } | undefined;
  crop: AvatarCrop;
  onCrop: (crop: AvatarCrop) => void;
  onSave: () => void;
  onCancel: () => void;
  onChoose: () => void;
  onClosed?: () => void;
  isSaving: boolean;
  error?: string;
  onUseLatest?: () => void;
  onOverwrite?: () => void;
};

/** Focused circular preview with equivalent keyboard and touch controls. */
export function AvatarCropDialog(props: Readonly<Props>): ReactNode {
  const isPhone = useMediaQuery("(max-width: 40em)");
  return (
    <Modal
      opened={props.opened}
      onClose={props.onCancel}
      returnFocus={false}
      onExitTransitionEnd={props.onClosed}
      title="Adjust your photo"
      fullScreen={isPhone}
      closeButtonProps={{ "aria-label": "Close" }}
      closeOnClickOutside={false}
      closeOnEscape={!props.isSaving}
      withCloseButton={!props.isSaving}
      size="md"
      classNames={{ body: classes.body }}
    >
      {_bodyFromProps(props)}
    </Modal>
  );
}

function _bodyFromProps(props: Readonly<Props>): ReactNode {
  return (
    <Stack gap="md" className={classes.content}>
      {_previewFromProps(props)}
      {_controlsFromProps(props)}
      {props.error ? <Text role="alert">{props.error}</Text> : null}
      {props.onUseLatest ? (
        <Group>
          <Button
            variant="default"
            onClick={props.onUseLatest}
            disabled={props.isSaving}
          >
            Use latest photo
          </Button>
          <Button onClick={props.onOverwrite} loading={props.isSaving}>
            Save this photo instead
          </Button>
        </Group>
      ) : null}
      <Group justify="space-between" className={classes.footer}>
        <Button
          variant="default"
          onClick={props.onCancel}
          disabled={props.isSaving}
        >
          Cancel
        </Button>
        <Button
          onClick={props.onSave}
          loading={props.isSaving}
          disabled={!props.dimensions || !!props.onUseLatest}
        >
          {props.isSaving ? "Saving photo..." : "Save photo"}
        </Button>
      </Group>
    </Stack>
  );
}

function _previewFromProps(props: Readonly<Props>): ReactNode {
  const preview = props.dimensions
    ? getPreviewFromAvatarCrop({
        ...props.dimensions,
        crop: props.crop,
        size: 264,
      })
    : undefined;
  return (
    <div className={classes.preview} aria-label="Photo crop preview">
      {preview ? (
        <img
          src={props.url}
          alt=""
          style={{
            width: `${(preview.width / 264) * 100}%`,
            height: `${(preview.height / 264) * 100}%`,
            left: `${(preview.left / 264) * 100}%`,
            top: `${(preview.top / 264) * 100}%`,
          }}
        />
      ) : (
        <Text role="status">Opening photo...</Text>
      )}
    </div>
  );
}

function _controlsFromProps(props: Readonly<Props>): ReactNode {
  return (
    <Stack gap="sm">
      <Text>Zoom</Text>
      {_zoomFromProps(props)}
      <Text>Move photo</Text>
      {_movesFromProps(props)}
      {_resetFromProps(props)}
    </Stack>
  );
}

function _zoomFromProps(props: Readonly<Props>): ReactNode {
  const maximum = Math.min(
    8,
    props.dimensions?.width ?? 8,
    props.dimensions?.height ?? 8,
  );
  const zoom = (value: number) => {
    props.onCrop({
      ...props.crop,
      zoom: Math.max(1, Math.min(maximum, value)),
    });
  };
  const disabled = props.isSaving || !props.dimensions;
  return (
    <Group wrap="nowrap">
      {_zoomButtonFromProps(props, zoom, -0.1)}
      <Slider
        thumbLabel="Photo zoom"
        min={1}
        max={maximum}
        step={0.1}
        value={props.crop.zoom}
        onChange={zoom}
        disabled={disabled}
        className={classes.slider}
      />
      {_zoomButtonFromProps(props, zoom, 0.1)}
    </Group>
  );
}

function _zoomButtonFromProps(
  props: Readonly<Props>,
  zoom: (value: number) => void,
  delta: number,
): ReactNode {
  return (
    <Button
      variant="default"
      aria-label={delta < 0 ? "Zoom out" : "Zoom in"}
      onClick={() => {
        zoom(props.crop.zoom + delta);
      }}
      disabled={props.isSaving || !props.dimensions}
    >
      {delta < 0 ? "-" : "+"}
    </Button>
  );
}

function _movesFromProps(props: Readonly<Props>): ReactNode {
  const move = (x: number, y: number) => {
    props.onCrop({
      ...props.crop,
      centerX: Math.max(0, Math.min(1, props.crop.centerX + x)),
      centerY: Math.max(0, Math.min(1, props.crop.centerY + y)),
    });
  };
  return (
    <Group gap="xs">
      {[
        { label: "Up", x: 0, y: 0.05 },
        { label: "Left", x: 0.05, y: 0 },
        { label: "Right", x: -0.05, y: 0 },
        { label: "Down", x: 0, y: -0.05 },
      ].map(({ label, x, y }) => {
        return (
          <Button
            key={label}
            variant="default"
            aria-label={`Move photo ${label.toLowerCase()}`}
            onClick={() => {
              move(x, y);
            }}
            disabled={props.isSaving || !props.dimensions}
          >
            {label}
          </Button>
        );
      })}
    </Group>
  );
}

function _resetFromProps(props: Readonly<Props>): ReactNode {
  return (
    <Group>
      <Button
        variant="default"
        onClick={() => {
          props.onCrop({ centerX: 0.5, centerY: 0.5, zoom: 1 });
        }}
        disabled={props.isSaving || !props.dimensions}
      >
        Reset
      </Button>
      <Button
        variant="subtle"
        onClick={props.onChoose}
        disabled={props.isSaving}
      >
        Choose another photo
      </Button>
    </Group>
  );
}
