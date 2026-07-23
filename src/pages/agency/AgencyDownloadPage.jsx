import { downloadGroupPayment, downloadReceptionList } from "../../api.js";
import { ExcelExportCard } from "../../components/cards/ExcelExportCard.jsx";
import { RosterExportCard } from "../../components/cards/RosterExportCard.jsx";
import { SimpleExportCard } from "../../components/cards/SimpleExportCard.jsx";
import { PageHeader } from "../../components/ui/PageHeader.jsx";

export function AgencyDownloadPage({ schools, batches }) {
  return (
    <>
      <PageHeader
        title="다운로드"
        description="단체수납입금표·접수명단·학생명단 및 신청현황표를 양식 엑셀로 추출합니다."
      />
      <div className="downloadPageGrid">
        <SimpleExportCard
          title="단체수납입금표"
          description="외국인등록 신청 건 전체를 학교별 시트로 나눠 내보냅니다."
          onExport={downloadGroupPayment}
        />
        <ExcelExportCard
          title="접수명단 (대학교 제출용)"
          description="외국인등록 신청 건의 접수일자·서비스항목·영문성명·등록번호·주소·연락처를 내보냅니다."
          schools={schools}
          onExport={downloadReceptionList}
        />
        <RosterExportCard
          title="학생명단 및 신청현황표"
          description="선택한 케이스의 학생 정보를 채운 신청현황표를 내보냅니다. 접수결과·회계 항목은 빈칸으로 생성됩니다."
          batches={batches}
        />
      </div>
    </>
  );
}
