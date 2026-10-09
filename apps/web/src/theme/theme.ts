import {
  ActionIcon,
  Anchor,
  Avatar,
  Badge,
  Button,
  Checkbox,
  createTheme,
  Divider,
  Menu,
  Modal,
  MultiSelect,
  NativeSelect,
  Paper,
  Pill,
  Popover,
  Progress,
  Radio,
  SegmentedControl,
  Switch,
  Table,
  Tabs,
  TagsInput,
  Textarea,
  TextInput,
  Tooltip,
  type MantineColorsTuple,
} from "@mantine/core";
import { DatePickerInput, TimeInput } from "@mantine/dates";
import classes from "@/theme/components.module.css";
import { variantColorResolver } from "@/theme/variantColorResolver";

/**
 * The one ink ramp. Every entry is the same custom property because a
 * rendition declares exactly four inks and derives everything else from them:
 * Mantine's ten-step ramp is a shape this system does not have. The tuple
 * exists so `theme.primaryColor` has something to point at; the real values
 * arrive through `variantColorResolver` and `cssVariablesResolver`, both
 * sibling modules of this one.
 */
const INK_RAMP: MantineColorsTuple = [
  "var(--ink)",
  "var(--ink)",
  "var(--ink)",
  "var(--ink)",
  "var(--ink)",
  "var(--ink)",
  "var(--ink)",
  "var(--ink)",
  "var(--ink)",
  "var(--ink)",
];

/**
 * The Memory Shoebox Mantine theme.
 *
 * Scales live here; colour lives in `src/styles/tokens/tokens.css` and
 * reaches Mantine through `cssVariablesResolver`. The split is deliberate: a
 * rendition is switched by an attribute on `<html>`, which CSS can follow
 * and a JavaScript theme object cannot.
 */
export const theme = createTheme({
  primaryColor: "ink",
  colors: { ink: INK_RAMP },
  white: "var(--print)",
  black: "var(--ink)",
  autoContrast: false,
  focusRing: "auto",
  variantColorResolver,

  fontFamily: "var(--font-ui)",
  fontFamilyMonospace: "var(--font-figure)",
  headings: {
    fontFamily: "var(--font-figure)",
    fontWeight: "700",
    textWrap: "balance",
    sizes: {
      h1: { fontSize: "var(--step-3)", lineHeight: "1.08" },
      h2: { fontSize: "var(--step-2)", lineHeight: "1.1" },
      h3: { fontSize: "var(--step-1)", lineHeight: "1.1" },
      h4: { fontSize: "var(--step-0)", lineHeight: "1.2" },
      h5: { fontSize: "var(--micro)", lineHeight: "1.4" },
      h6: { fontSize: "var(--micro)", lineHeight: "1.4" },
    },
  },

  /* Nothing in the ramp is under 15px: the audience skews older. */
  fontSizes: {
    xs: "var(--micro)",
    sm: "var(--micro)",
    md: "var(--step-0)",
    lg: "var(--step-1)",
    xl: "var(--step-2)",
  },
  lineHeights: { xs: "1.4", sm: "1.45", md: "1.5", lg: "1.5", xl: "1.4" },

  spacing: {
    xs: "var(--sp-1)",
    sm: "var(--sp-2)",
    md: "var(--sp-3)",
    lg: "var(--sp-4)",
    xl: "var(--sp-5)",
  },

  /* Zero everywhere. The only round things in this world are two dots. */
  defaultRadius: 0,
  radius: { xs: "0", sm: "0", md: "0", lg: "0", xl: "0" },

  /* One kind of shadow: paper lying on a panel. */
  shadows: {
    xs: "var(--shadow-flat)",
    sm: "var(--shadow-print)",
    md: "var(--shadow-frame)",
    lg: "var(--shadow-card)",
    xl: "var(--shadow-card)",
  },

  /* Both breakpoints from DESIGN.md, in em so they track zoom. */
  breakpoints: {
    xs: "36em",
    sm: "44em",
    md: "56em",
    lg: "75em",
    xl: "96em",
  },

  respectReducedMotion: true,

  /** Scalars the layout needs in TypeScript as well as in CSS. */
  other: {
    tap: "3rem",
    spine: "13rem",
    tile: "9.5rem",
    tileNarrow: "6.5rem",
    ease: "cubic-bezier(0.16, 1, 0.3, 1)",
  },

  components: {
    Button: Button.extend({
      defaultProps: { size: "md" },
      classNames: { root: classes.buttonRoot, label: classes.buttonLabel },
    }),
    ActionIcon: ActionIcon.extend({
      defaultProps: { variant: "subtle" },
      classNames: { root: classes.actionIconRoot },
    }),
    TextInput: TextInput.extend({
      classNames: {
        root: classes.inputWrapperRoot,
        label: classes.inputLabel,
        description: classes.inputDescription,
        error: classes.inputError,
        input: classes.inputField,
      },
    }),
    Textarea: Textarea.extend({
      classNames: {
        root: classes.inputWrapperRoot,
        label: classes.inputLabel,
        description: classes.inputDescription,
        error: classes.inputError,
        input: classes.inputField,
      },
    }),
    NativeSelect: NativeSelect.extend({
      classNames: {
        root: classes.inputWrapperRoot,
        label: classes.inputLabel,
        description: classes.inputDescription,
        error: classes.inputError,
        input: `${classes.inputField} ${classes.nativeSelectInput}`,
        section: classes.nativeSelectSection,
      },
    }),
    Checkbox: Checkbox.extend({
      classNames: {
        input: classes.checkboxInput,
        label: classes.checkboxLabel,
      },
    }),
    Radio: Radio.extend({
      classNames: { radio: classes.radioRadio, label: classes.radioLabel },
    }),
    Switch: Switch.extend({
      classNames: {
        root: classes.switchRoot,
        body: classes.switchBody,
        track: classes.switchTrack,
        thumb: classes.switchThumb,
        label: classes.switchLabel,
      },
    }),
    SegmentedControl: SegmentedControl.extend({
      classNames: {
        root: classes.segmentedRoot,
        indicator: classes.segmentedIndicator,
        label: classes.segmentedLabel,
        control: classes.segmentedControl,
      },
    }),
    Paper: Paper.extend({ classNames: { root: classes.paperRoot } }),
    Menu: Menu.extend({
      classNames: {
        dropdown: classes.menuDropdown,
        item: classes.menuItem,
        divider: classes.menuDivider,
      },
    }),
    Modal: Modal.extend({
      defaultProps: {
        centered: true,
        overlayProps: { backgroundOpacity: 0.6 },
        // Mantine's cross carries no name, and it is what takes focus when a
        // dialog opens, so without a label a screen reader announces only
        // "button".
        closeButtonProps: { "aria-label": "Close" },
      },
      classNames: {
        content: classes.modalContent,
        header: classes.modalHeader,
        body: classes.modalBody,
        title: classes.modalTitle,
        overlay: classes.modalOverlay,
        close: classes.modalClose,
      },
    }),
    Popover: Popover.extend({
      defaultProps: { shadow: "sm", offset: 12, arrowSize: 10 },
      classNames: {
        dropdown: classes.popoverDropdown,
        arrow: classes.popoverArrow,
      },
    }),
    Table: Table.extend({
      classNames: {
        table: classes.tableTable,
        thead: classes.tableThead,
        th: classes.tableTh,
        td: classes.tableTd,
        tr: classes.tableTr,
      },
    }),
    Badge: Badge.extend({ classNames: { root: classes.badgeRoot } }),
    Pill: Pill.extend({
      classNames: { root: classes.pillRoot, remove: classes.pillRemove },
    }),
    MultiSelect: MultiSelect.extend({
      defaultProps: {
        searchable: true,
        hidePickedOptions: true,
        comboboxProps: { withinPortal: true },
        nothingFoundMessage: "Nobody by that name",
      },
      classNames: {
        root: classes.inputWrapperRoot,
        label: classes.inputLabel,
        description: classes.inputDescription,
        error: classes.inputError,
        input: `${classes.inputField} ${classes.tagsField}`,
        inputField: classes.tagsTypeField,
        pillsList: classes.tagsPillsList,
        dropdown: classes.comboDropdown,
        option: classes.comboOption,
        empty: classes.comboEmpty,
        groupLabel: classes.comboGroupLabel,
      },
    }),
    TagsInput: TagsInput.extend({
      defaultProps: { comboboxProps: { withinPortal: true } },
      classNames: {
        root: classes.inputWrapperRoot,
        label: classes.inputLabel,
        description: classes.inputDescription,
        error: classes.inputError,
        input: `${classes.inputField} ${classes.tagsField}`,
        inputField: classes.tagsTypeField,
        pillsList: classes.tagsPillsList,
        dropdown: classes.comboDropdown,
        option: classes.comboOption,
        empty: classes.comboEmpty,
      },
    }),
    Progress: Progress.extend({
      classNames: {
        root: classes.progressRoot,
        section: classes.progressSection,
      },
    }),
    Tabs: Tabs.extend({
      classNames: { list: classes.tabsList, tab: classes.tabsTab },
    }),
    Tooltip: Tooltip.extend({
      classNames: { tooltip: classes.tooltipTooltip },
    }),
    Divider: Divider.extend({ classNames: { root: classes.dividerRoot } }),
    Anchor: Anchor.extend({ classNames: { root: classes.anchorRoot } }),
    DatePickerInput: DatePickerInput.extend({
      defaultProps: {
        valueFormat: "D MMMM YYYY",
        popoverProps: { withinPortal: true },
      },
      classNames: {
        root: classes.inputWrapperRoot,
        label: classes.inputLabel,
        description: classes.inputDescription,
        error: classes.inputError,
        input: classes.inputField,
        day: classes.calendarDay,
        weekday: classes.calendarWeekday,
        calendarHeaderLevel: classes.calendarHeaderLevel,
        calendarHeaderControl: classes.calendarHeaderControl,
      },
    }),
    TimeInput: TimeInput.extend({
      classNames: {
        root: classes.inputWrapperRoot,
        label: classes.inputLabel,
        description: classes.inputDescription,
        error: classes.inputError,
        input: classes.inputField,
      },
    }),
    Avatar: Avatar.extend({
      classNames: {
        root: classes.avatarRoot,
        placeholder: classes.avatarPlaceholder,
      },
    }),
  },
});
