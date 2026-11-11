import type { ComponentProps, ReactElement, ReactNode } from "react";
import { DatePickerField } from "@/components/DatePickerField";

const FIELD_BOX_SHAPE =
  "h-[51px] rounded-[10px] border border-line text-ink placeholder:text-ink-placeholder focus:border-accent focus:outline-none aria-[invalid=true]:border-accent";

/**
 * 입력 칸의 테두리·높이·초점 모양. 너비와 좌우 여백은 칸마다 다르므로 쓰는 쪽이 더한다.
 *
 * @example <input className={`w-full px-4 ${FIELD_BOX_CLASS_NAME}`} />
 */
export const FIELD_BOX_CLASS_NAME = `${FIELD_BOX_SHAPE} bg-surface`;

/**
 * 입력 칸 이름의 글자 모양. 칸 묶음(fieldset)의 legend처럼 FieldLabel을 못 쓰는 곳도 같은 모양을 쓴다.
 *
 * @example <legend className={FIELD_LABEL_CLASS_NAME}>고칠 범위</legend>
 */
export const FIELD_LABEL_CLASS_NAME = "text-[13px] text-ink-sub";

/** 바탕이 surface인 창 안에서는 칸이 묻히지 않게 화면 바탕색으로 칠한다 */
const dialogFieldBoxClassName = `${FIELD_BOX_SHAPE} bg-background`;

const FIELD_CONTROL_LAYOUT = "mt-2 w-full px-4";
const fieldControlClassName = `${FIELD_CONTROL_LAYOUT} ${FIELD_BOX_CLASS_NAME}`;

/** 오류 문구의 id. 칸의 `aria-describedby`가 이 id를 가리킨다 */
const toErrorId = (id: string): string => `${id}-error`;

/** 칸을 설명하는 요소 id. 오류가 있으면 오류 문구를 뒤에 붙인다 */
const toDescribedBy = (id: string, error: string | undefined, describedBy: string | undefined): string | undefined =>
  [describedBy, error && toErrorId(id)].filter(Boolean).join(" ") || undefined;

interface FieldLabelProps {
  htmlFor: string;
  label: ReactNode;
  /** 이름 옆 흐린 글씨. 괄호는 붙여 그린다 */
  hint?: string | undefined;
  /** 이름 줄 오른쪽에 둘 것(글자 수, 버튼) */
  aside?: ReactNode;
}

/**
 * 입력 칸 이름. 오른쪽에 둘 것이 있으면 한 줄에 함께 둔다.
 *
 * @example <FieldLabel htmlFor="place" label="장소" hint="선택" />
 */
export const FieldLabel = ({ htmlFor, label, hint, aside }: FieldLabelProps): ReactElement => {
  const labelElement = (
    <label htmlFor={htmlFor} className={FIELD_LABEL_CLASS_NAME}>
      {label}
      {hint && <span className="text-ink-placeholder"> ({hint})</span>}
    </label>
  );
  if (!aside) return labelElement;
  return (
    <div className="flex items-baseline justify-between">
      {labelElement}
      {aside}
    </div>
  );
};

interface FieldErrorProps {
  /** 오류 문구의 id. 칸의 `aria-describedby`가 가리키는 값과 같아야 한다 */
  id: string;
  error: string | undefined;
}

/**
 * 칸 아래 오류 문구. 오류가 없으면 그리지 않는다.
 *
 * @example <FieldError id="tag-error" error={errors.tags} />
 */
export const FieldError = ({ id, error }: FieldErrorProps): ReactElement | undefined =>
  error ? (
    <p id={id} className="mt-2 text-[12px] text-accent">
      {error}
    </p>
  ) : undefined;

interface FieldFrameProps {
  /** 칸의 id. 이름이 이 칸을 가리키고, 오류 문구 id는 `<id>-error`가 된다 */
  id: string;
  label: ReactNode;
  hint?: string;
  aside?: ReactNode;
  error?: string | undefined;
  /** 칸 묶음에 더할 클래스(남은 높이 채우기, 위 여백) */
  className?: string;
}

interface FormFieldProps extends FieldFrameProps {
  children: ReactNode;
}

/**
 * 이름·칸·오류 문구 묶음. 칸은 `id`와 `<id>-error`를 이어 받아야 한다. 글자 칸은 `TextField`를 쓴다.
 *
 * @example <FormField id="memo" label="메모" error={errors.memo}><CustomInput id="memo" /></FormField>
 */
const FormField = ({ id, label, hint, aside, error, className, children }: FormFieldProps): ReactElement => (
  <div className={className ? `flex flex-col ${className}` : "flex flex-col"}>
    <FieldLabel htmlFor={id} label={label} hint={hint} aside={aside} />
    {children}
    <FieldError id={toErrorId(id)} error={error} />
  </div>
);

type ControlProps<Tag extends "input" | "textarea"> = Omit<
  ComponentProps<Tag>,
  "id" | "className" | "children" | "onChange" | "aria-invalid" | "aria-describedby"
> & {
  onChange: (value: string) => void;
  /** 오류 말고도 칸을 설명하는 요소 id(글자 수 등) */
  describedBy?: string;
};

type TextFieldProps = FieldFrameProps &
  ControlProps<"input"> & {
    /** 바탕이 surface인 창 안에 둘 때 */
    isInDialog?: boolean;
  };

/**
 * 한 줄 글자 칸. 오류가 있으면 테두리를 바꾸고 화면 읽기가 오류 문구를 함께 읽게 한다.
 *
 * @example <TextField id="title" label="제목" value={title} error={errors.title} onChange={setTitle} />
 */
export const TextField = ({ id, label, hint, aside, error, className, describedBy, isInDialog = false, onChange, ...inputProps }: TextFieldProps): ReactElement => (
  <FormField id={id} label={label} hint={hint} aside={aside} error={error} className={className}>
    <input
      {...inputProps}
      id={id}
      aria-invalid={Boolean(error)}
      aria-describedby={toDescribedBy(id, error, describedBy)}
      onChange={(event) => onChange(event.target.value)}
      className={isInDialog ? `${FIELD_CONTROL_LAYOUT} ${dialogFieldBoxClassName}` : fieldControlClassName}
    />
  </FormField>
);

type TextAreaFieldProps = FieldFrameProps & ControlProps<"textarea">;

/**
 * 여러 줄 글자 칸. 묶음의 남은 높이를 채우므로 묶음에 `grow`를 주면 칸이 늘어난다.
 *
 * @example <TextAreaField id="memo" label="메모" hint="선택" rows={4} value={memo} className="grow" onChange={setMemo} />
 */
export const TextAreaField = ({ id, label, hint, aside, error, className, describedBy, onChange, ...textareaProps }: TextAreaFieldProps): ReactElement => (
  <FormField id={id} label={label} hint={hint} aside={aside} error={error} className={className}>
    <textarea
      {...textareaProps}
      id={id}
      aria-invalid={Boolean(error)}
      aria-describedby={toDescribedBy(id, error, describedBy)}
      onChange={(event) => onChange(event.target.value)}
      className={`${fieldControlClassName} h-auto grow resize-y py-3 leading-[1.5]`}
    />
  </FormField>
);

type DateFieldProps = Omit<FieldFrameProps, "label"> &
  Omit<ComponentProps<typeof DatePickerField>, "id" | "label" | "isInvalid" | "describedBy" | "className"> & {
    /** 칸 이름. 날짜 선택 창 제목과 화면 읽기에도 쓴다 */
    label: string;
  };

/**
 * 날짜 칸. 다른 글자 칸과 같은 모양으로 날짜 선택 창을 연다.
 *
 * @example <DateField id="date" label="날짜" value={date} error={errors.date} onChange={setDate} />
 */
export const DateField = ({ id, label, hint, aside, error, className, ...pickerProps }: DateFieldProps): ReactElement => (
  <FormField id={id} label={label} hint={hint} aside={aside} error={error} className={className}>
    <DatePickerField
      {...pickerProps}
      id={id}
      label={label}
      isInvalid={Boolean(error)}
      describedBy={toDescribedBy(id, error, undefined)}
      className={fieldControlClassName}
    />
  </FormField>
);
