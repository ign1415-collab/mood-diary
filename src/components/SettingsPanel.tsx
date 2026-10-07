interface Props {
  onExport: () => Promise<void>
  onRestore: () => void
}

export function SettingsPanel({ onExport, onRestore }: Props) {
  return (
    <section className="settings-card" aria-labelledby="settings-title">
      <div className="settings-heading">
        <span aria-hidden="true">⚙</span>
        <div>
          <p>MOOD DIARY</p>
          <h2 id="settings-title">설정</h2>
        </div>
      </div>

      <div className="settings-section">
        <h3>데이터 백업</h3>
        <p>기록 전체를 파일로 보관하거나 이전에 저장한 백업을 다시 불러올 수 있어요.</p>
        <div className="settings-actions">
          <button type="button" onClick={() => void onExport()}>백업 내려받기</button>
          <button type="button" onClick={onRestore}>백업 복원</button>
        </div>
      </div>

      <p className="settings-note">기록은 로그인한 Google 계정별로 분리되어 Firebase에 저장됩니다.</p>
    </section>
  )
}
