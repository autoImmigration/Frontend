import { NationalityCombobox } from "../components/ui/NationalityCombobox.jsx";
import { ROLE_HELP, ROLE_LABELS } from "../constants/roles.js";
import { nationalityOptions } from "../mockData.js";

export function LoginPage({
  loginType,
  studentForm,
  orgForms,
  onRoleSelect,
  onStudentFieldChange,
  onOrgFieldChange,
  onSubmit,
  error,
}) {
  return (
    <main className="loginShell">
      <section className="loginCard">
        <div className="loginCardHeader">
          <div className="loginBrand">Immigration Ops</div>
          <h1>로그인</h1>
          <p>{ROLE_HELP[loginType]}</p>
        </div>

        <div className="roleTabs" role="tablist" aria-label="로그인 역할">
          {Object.entries(ROLE_LABELS).map(([role, label]) => (
            <button
              key={role}
              type="button"
              className={`roleTab${loginType === role ? " isActive" : ""}`}
              onClick={() => onRoleSelect(role)}
            >
              {label}
            </button>
          ))}
        </div>

        <form className="formStack" onSubmit={onSubmit}>
          {loginType === "student" ? (
            <>
              <label className="field">
                <span>국적</span>
                {/* 목록 밖 표기(영문명/ISO코드)를 직접 입력해도 서버 정규화로 매칭됨 */}
                <NationalityCombobox
                  value={studentForm.nationality}
                  onChange={(value) => onStudentFieldChange("nationality", value)}
                  options={nationalityOptions}
                />
              </label>

              <label className="field">
                <span>여권번호</span>
                <input
                  value={studentForm.passportNumber}
                  onChange={(event) =>
                    onStudentFieldChange("passportNumber", event.target.value)
                  }
                  placeholder="여권번호를 입력하세요"
                />
              </label>

              <label className="field">
                <span>생년월일</span>
                <input
                  type="date"
                  value={studentForm.birthDate}
                  onChange={(event) =>
                    onStudentFieldChange("birthDate", event.target.value)
                  }
                />
              </label>
            </>
          ) : (
            <>
              <label className="field">
                <span>아이디</span>
                <input
                  value={orgForms[loginType].username}
                  onChange={(event) =>
                    onOrgFieldChange(loginType, "username", event.target.value)
                  }
                  placeholder={`${ROLE_LABELS[loginType]} 계정 아이디`}
                />
              </label>

              <label className="field">
                <span>비밀번호</span>
                <input
                  type="password"
                  value={orgForms[loginType].password}
                  onChange={(event) =>
                    onOrgFieldChange(loginType, "password", event.target.value)
                  }
                  placeholder="비밀번호를 입력하세요"
                />
              </label>
            </>
          )}

          <button type="submit" className="primaryButton loginButton">
            로그인
          </button>
        </form>

        {error ? <div className="errorBox">{error}</div> : null}
      </section>
    </main>
  );
}
