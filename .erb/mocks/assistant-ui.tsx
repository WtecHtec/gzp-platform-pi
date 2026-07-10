/* eslint-disable react/jsx-props-no-spreading, react/jsx-no-useless-fragment, react/no-array-index-key, react/require-default-props, react/jsx-no-constructed-context-values, no-undef */
import {
  createContext,
  FormEvent,
  PropsWithChildren,
  useContext,
  useState,
} from 'react';

type Adapter = {
  messages: unknown[];
  convertMessage: (message: any) => any;
  onNew: (message: any) => Promise<void>;
  onCancel?: () => Promise<void>;
};

const RuntimeContext = createContext<Adapter | null>(null);
const MessageContext = createContext<any>(null);
const ComposerContext = createContext<{
  value: string;
  setValue: (value: string) => void;
} | null>(null);

export function useExternalStoreRuntime(adapter: Adapter) {
  return adapter;
}

export function AssistantRuntimeProvider({
  runtime,
  children,
}: PropsWithChildren<{ runtime: Adapter }>) {
  return (
    <RuntimeContext.Provider value={runtime}>
      {children}
    </RuntimeContext.Provider>
  );
}

function Passthrough({
  children,
  ...props
}: PropsWithChildren<Record<string, unknown>>) {
  return <div {...props}>{children}</div>;
}

function Messages({
  children,
}: {
  children: (value: { message: any }) => React.ReactNode;
}) {
  const runtime = useContext(RuntimeContext);
  return (
    <>
      {runtime?.messages.map((raw) => {
        const message = runtime.convertMessage(raw);
        return (
          <MessageContext.Provider key={message.id} value={message}>
            {children({ message })}
          </MessageContext.Provider>
        );
      })}
    </>
  );
}

function MessageRoot({
  children,
  ...props
}: PropsWithChildren<Record<string, unknown>>) {
  return <article {...props}>{children}</article>;
}

function MessageParts() {
  const message = useContext(MessageContext);
  return (
    <>
      {message?.content.map((part: any, index: number) =>
        part.type === 'text' ? (
          <p key={`${part.text}-${index}`}>{part.text}</p>
        ) : null,
      )}
    </>
  );
}

function ComposerRoot({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  const runtime = useContext(RuntimeContext);
  const [value, setValue] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim()) return;
    await runtime?.onNew({
      content: [{ type: 'text', text: value }],
    });
    setValue('');
  };
  return (
    <ComposerContext.Provider value={{ value, setValue }}>
      <form className={className} onSubmit={submit}>
        {children}
      </form>
    </ComposerContext.Provider>
  );
}

function ComposerInput(props: Record<string, unknown>) {
  const composer = useContext(ComposerContext);
  return (
    <textarea
      {...props}
      onChange={(event) => composer?.setValue(event.target.value)}
      value={composer?.value || ''}
    />
  );
}

function ComposerSend(props: PropsWithChildren<Record<string, unknown>>) {
  return <button {...props} type="submit" />;
}

function ComposerCancel(props: PropsWithChildren<Record<string, unknown>>) {
  const runtime = useContext(RuntimeContext);
  return (
    <button {...props} onClick={() => runtime?.onCancel?.()} type="button" />
  );
}

export const ThreadPrimitive = {
  Root: Passthrough,
  Viewport: Passthrough,
  ViewportFooter: Passthrough,
  Messages,
};

export const MessagePrimitive = {
  Root: MessageRoot,
  Parts: MessageParts,
};

export const ComposerPrimitive = {
  Root: ComposerRoot,
  Input: ComposerInput,
  Send: ComposerSend,
  Cancel: ComposerCancel,
};
