import { type UseChatHelpers } from 'ai/react'
import { Button } from '@/components/ui/button'
import { PromptForm } from '@/components/prompt-form'
import { ButtonScrollToBottom } from '@/components/button-scroll-to-bottom'
import { IconRefresh, IconStop } from '@/components/ui/icons'
import { FooterText } from '@/components/footer'

// 场景列表
const SCENES = [
  { id: 'general', label: '一般' },
  { id: 'email', label: '📧 邮件' },
  { id: 'decline', label: '🙅 拒绝' },
  { id: 'apology', label: '🙏 道歉' },
  { id: 'request', label: '🤲 请求' },
  { id: 'report', label: '📊 汇报' },
]

export interface ChatPanelProps
  extends Pick<
    UseChatHelpers,
    | 'append'
    | 'isLoading'
    | 'reload'
    | 'messages'
    | 'stop'
    | 'input'
    | 'setInput'
  > {
  id?: string
  selectedScene: string
  setSelectedScene: (scene: string) => void
  studyMode: boolean
  setStudyMode: (mode: boolean) => void
}

export function ChatPanel({
  id,
  isLoading,
  stop,
  append,
  reload,
  input,
  setInput,
  messages,
  selectedScene,
  setSelectedScene,
  studyMode,
  setStudyMode,
}: ChatPanelProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 bg-gradient-to-b from-muted/10 from-10% to-muted/30 to-50%">
      <ButtonScrollToBottom />
      <div className="mx-auto sm:max-w-2xl sm:px-4">
        <div className="flex h-10 items-center justify-center">
          {isLoading ? (
            <Button
              variant="outline"
              onClick={() => stop()}
              className="bg-background"
            >
              <IconStop className="mr-2" />
              Stop generating
            </Button>
          ) : (
            messages?.length > 0 && (
              <Button
                variant="outline"
                onClick={() => reload()}
                className="bg-background"
              >
                <IconRefresh className="mr-2" />
                Regenerate response
              </Button>
            )
          )}
        </div>
        <div className="space-y-3 border-t bg-background px-4 py-2 shadow-lg sm:rounded-t-xl sm:border md:py-4">

          {/* 场景选择栏 */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground mr-1">场景：</span>
            {SCENES.map(scene => (
              <button
                key={scene.id}
                onClick={() => setSelectedScene(scene.id)}
                className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                  selectedScene === scene.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:border-primary'
                }`}
              >
                {scene.label}
              </button>
            ))}
          </div>

          {/* 学習モード开关 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">学習モード：</span>
            <button
              onClick={() => setStudyMode(!studyMode)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                studyMode ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                  studyMode ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-xs text-muted-foreground">
              {studyMode ? 'ON（显示敬语解说）' : 'OFF（只输出敬语）'}
            </span>
          </div>

          <PromptForm
            onSubmit={async value => {
              await append({
                id,
                content: value,
                role: 'user'
              })
            }}
            input={input}
            setInput={setInput}
            isLoading={isLoading}
          />
          <FooterText className="hidden sm:block" />
        </div>
      </div>
    </div>
  )
}
