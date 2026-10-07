interface Props {
  onRestore: () => void
}

export function SettingsPanel({ onRestore }: Props) {
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
          <a href="/api/export" download>백업 내려받기</a>
          <button type="button" onClick={onRestore}>백업 복원</button>
        </div>
      </div>

      <p className="settings-note">모든 기록은 이 컴퓨터의 로컬 데이터베이스에 저장됩니다.</p>
    </section>
  )
}
