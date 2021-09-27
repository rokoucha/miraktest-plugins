import { Plus, X } from "react-feather"
import type { RecoilState } from "recoil"
import ReconnectingWebSocket from "reconnecting-websocket"
import { AtomFamily, InitPlugin } from "./@types/plugin"
import tailwind from "./tailwind.scss"
import { trimCommentForFlow } from "./zenza/comment"
import { NicoCommentChat } from "./zenza/types"

/**
 * MirakTest Saya Plugin
 * Sayaからコメントを取得し、ZenzaWatchに流し込むプラグイン
 * https://github.com/SlashNephy/saya
 */

const _id = "io.github.ci7lus.miraktest-plugins.saya"
const prefix = "plugins.ci7lus.saya"
const meta = {
  id: _id,
  name: "Saya (Zenza)",
  author: "ci7lus",
  version: "1.0.0",
  description:
    "Sayaからコメントを取得するプラグイン (io.github.ci7lus.miraktest-plugins.zenzawatchが必要です)",
}
const commentWindowId = `${_id}.sayaCommentWindow`

type SayaSetting = {
  baseUrl?: string
  replaces: [string, string][]
}

type SayaCommentPayload = {
  sourceUrl: string | null
  source: string
  no: number
  time: number
  timeMs: number
  author: string
  text: string
  color: string
  type: "right"
  commands: []
}

const main: InitPlugin = {
  renderer: ({ packages, functions, atoms }) => {
    const React = packages.React
    const { useEffect, useState } = React
    const {
      atom,
      atomFamily,
      useRecoilValue,
      useRecoilState,
      useSetRecoilState,
    } = packages.Recoil
    const remote = packages.Electron
    const remoteWindow = remote.getCurrentWindow()

    const sayaSettingAtom = atom<SayaSetting>({
      key: `${prefix}.sayaSetting`,
      default: {
        replaces: [],
      },
    })

    let commentAtom: RecoilState<NicoCommentChat> | null = null

    const commentFamilyKey = `${prefix}.rawComment`
    const rawCommentFamily = atomFamily<SayaCommentPayload | null, number>({
      key: commentFamilyKey,
      default: null,
    })

    return {
      ...meta,
      exposedAtoms: [],
      sharedAtoms: [
        {
          type: "atom",
          atom: sayaSettingAtom,
        },
        {
          type: "family",
          atom: rawCommentFamily,
          key: commentFamilyKey,
          arg: 0,
        },
      ],
      storedAtoms: [
        {
          type: "atom",
          atom: sayaSettingAtom,
        },
      ],
      setup({ plugins }) {
        const zenza = plugins.find(
          (plugin) => plugin.id === "io.github.ci7lus.miraktest-plugins.zenza"
        )
        if (!zenza) return
        const family = zenza.exposedAtoms.find(
          (atom): atom is AtomFamily<number, NicoCommentChat> =>
            atom.type === "family" &&
            atom.key === "plugins.ci7lus.zenza.comment"
        )
        if (!family) return
        commentAtom = family.atom(remoteWindow.id)
      },
      components: [
        {
          id: `${prefix}.onPlayer`,
          position: "onPlayer",
          component: () => {
            useEffect(() => {
              console.warn("onPlayerTimeDisplayの描画")
            }, [])
            const sayaSetting = useRecoilValue(sayaSettingAtom)
            const service = useRecoilValue(atoms.contentPlayerServiceSelector)
            const setComment = commentAtom
              ? useSetRecoilState(commentAtom)
              : null
            const setRawComment = useSetRecoilState(
              rawCommentFamily(remoteWindow.id)
            )
            useEffect(() => {
              if (!setComment) {
                console.warn("コメント送信先の取得に失敗しています")
                return
              }
              if (!sayaSetting.baseUrl) {
                console.warn("Sayaの設定が行われていません")
                return
              }
              if (!service) {
                console.warn("サービスが不明です")
                return
              }

              let ws: ReconnectingWebSocket
              try {
                const wsUrl = new URL(sayaSetting.baseUrl)
                if (wsUrl.protocol === "https:") {
                  wsUrl.protocol = "wss:"
                } else {
                  wsUrl.protocol = "ws:"
                }

                if (!service.channel) throw new Error("service.channel")

                let channelType = service.channel.type as string
                const repl = (sayaSetting.replaces || []).find(
                  ([before]) => before === channelType
                )
                if (repl) {
                  channelType = repl[1]
                }

                ws = new ReconnectingWebSocket(
                  `${wsUrl.href}/comments/${channelType}_${service.serviceId}/live`
                )
                ws.addEventListener("message", (e) => {
                  const payload: SayaCommentPayload = JSON.parse(e.data)
                  if (payload.text.startsWith("RT @")) return
                  setRawComment(payload)
                  const commentText = trimCommentForFlow(payload.text)
                  if (commentText.trim().length === 0) return
                  setComment({
                    no: payload.no,
                    date: payload.time,
                    date_usec: payload.timeMs,
                    user_id: payload.author || undefined,
                    mail: payload.type,
                    content: commentText,
                  })
                })
                ws.addEventListener("open", () => {
                  console.info("Sayaへ接続しました")
                })
              } catch {
                console.info("Sayaへの接続に失敗しました")
              }

              return () => {
                ws?.close()
              }
            }, [service, sayaSetting])
            return <></>
          },
        },
        {
          id: `${prefix}.settings`,
          position: "onSetting",
          label: meta.name,
          component: () => {
            const [sayaSetting, setSayaSetting] =
              useRecoilState(sayaSettingAtom)
            const [url, setUrl] = useState(sayaSetting.baseUrl)
            const [replaces, setReplaces] = useState(sayaSetting.replaces)
            const [repl1, setRepl1] = useState("")
            const [repl2, setRepl2] = useState("")
            return (
              <>
                <style>{tailwind}</style>
                <form
                  className="m-4"
                  onSubmit={(e) => {
                    e.preventDefault()
                    setSayaSetting({
                      baseUrl: url || undefined,
                      replaces,
                    })
                  }}
                >
                  <label className="mb-2 block">
                    <span>Saya の URL</span>
                    <input
                      type="text"
                      placeholder="https://saya"
                      className="block mt-2 form-input rounded-md w-full text-gray-900"
                      value={url || ""}
                      onChange={(e) => setUrl(e.target.value)}
                    />
                  </label>
                  <label className="mb-2 block">
                    <span>放送波置換設定</span>
                    <div className="flex flex-wrap space-x-2">
                      {(replaces || []).map(([before, after], idx) => (
                        <div
                          className="mt-2 p-1 px-2 bg-gray-200 text-gray-800 rounded-md flex space-x-1 items-center justify-center"
                          key={idx}
                        >
                          <span>
                            {before}→{after}
                          </span>
                          <span
                            title="削除する"
                            className="flex items-center justify-center bg-gray-200 rounded-md cursor-pointer"
                            onClick={() => {
                              const copied = Object.assign([], replaces)
                              ;(copied as (string | null)[])[idx] = null
                              setReplaces(copied.filter((s) => !!s))
                            }}
                          >
                            <X className="pointer-events-none" size={16} />
                          </span>
                        </div>
                      ))}
                    </div>
                    <datalist id="serviceTypes">
                      <option value="GR"></option>
                      <option value="BS"></option>
                      <option value="CS"></option>
                      <option value="SKY"></option>
                    </datalist>
                    <div className="flex space-x-2 mt-4">
                      <input
                        type="text"
                        placeholder="SKY"
                        className="block mt-2 form-input rounded-md w-full text-gray-900"
                        value={repl1}
                        onChange={(e) => setRepl1(e.target.value)}
                        list="serviceTypes"
                      />
                      <input
                        type="text"
                        placeholder="GR"
                        className="block mt-2 form-input rounded-md w-full text-gray-900"
                        value={repl2}
                        onChange={(e) => setRepl2(e.target.value)}
                        list="serviceTypes"
                      />
                      <button
                        type="button"
                        className="mt-2 px-4 flex items-center justify-center text-gray-900 bg-gray-200 rounded-md focus:outline-none cursor-pointer"
                        onClick={() => {
                          setReplaces((replaces) => [
                            ...replaces,
                            [repl1, repl2],
                          ])
                        }}
                        disabled={!repl1 || !repl2}
                      >
                        <Plus className="pointer-events-none" size={16} />
                      </button>
                    </div>
                  </label>
                  <button
                    type="submit"
                    className="bg-gray-100 text-gray-800 p-2 px-2 my-4 rounded-md focus:outline-none cursor-pointer"
                  >
                    保存
                  </button>
                </form>
              </>
            )
          },
        },
      ],
      destroy() {
        return
      },
      contextMenu: {
        label: meta.name,
        submenu: [
          {
            label: "コメント一覧",
            click: () => {
              functions.openWindow({
                name: commentWindowId,
                isSingletone: true,
                args: {
                  width: 300,
                  height: 720,
                },
              })
            },
          },
        ],
      },
      windows: {
        [commentWindowId]: () => {
          const [windowId, setWindowId] = useState(1)
          const playerIds = useRecoilValue(atoms.globalContentPlayerIdsSelector)
          const [comments, setComments] = useState<SayaCommentPayload[]>([])
          const comment = useRecoilValue(rawCommentFamily(windowId))
          useEffect(() => {
            if (!comment) return
            setComments((prev) =>
              prev.find(
                (_comment) =>
                  _comment.time === comment.time &&
                  _comment.timeMs === comment.timeMs
              )
                ? prev
                : [
                    comment,
                    ...(100 < prev.length ? [...prev].slice(0, 100) : prev),
                  ]
            )
          }, [comment])
          const playingContent = useRecoilValue(
            atoms.globalContentPlayerPlayingContentFamily(windowId)
          )
          useEffect(() => {
            remoteWindow.setTitle("Saya コメントウィンドウ")
          }, [])
          return (
            <>
              <style>{tailwind}</style>
              <div className="w-full h-screen bg-gray-100 text-gray-900 flex flex-col">
                {playingContent?.service ? (
                  <>{playingContent.service.name}</>
                ) : (
                  <p>サービスが不明です</p>
                )}
                <select
                  className="form-select my-1 block w-full"
                  onChange={(e) => {
                    const playerId = parseInt(e.target.value)
                    if (Number.isNaN(playerId)) return
                    if (!playerIds.includes(playerId)) return
                    setWindowId(playerId)
                  }}
                >
                  {playerIds.map((playerId) => (
                    <option key={playerId} value={playerId}>
                      {playerId}
                    </option>
                  ))}
                </select>
                <div className="overflow-auto select-auto">
                  {comments.map((comment) => (
                    <p
                      key={`${comment.time}${comment.timeMs}`}
                      className="overflow-ellipsis"
                    >
                      {comment.text}
                    </p>
                  ))}
                </div>
              </div>
            </>
          )
        },
      },
    }
  },
}

export default main
