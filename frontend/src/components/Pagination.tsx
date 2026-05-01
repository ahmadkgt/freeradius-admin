import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const { t, i18n } = useTranslation();
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const isRtl = i18n.dir() === "rtl";
  const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;

  return (
    <div className="flex items-center justify-between px-2 py-3 border-t text-sm">
      <span className="text-muted-foreground">
        {t("common.page")} {page} {t("common.of")} {lastPage} ({total})
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <PrevIcon className="h-4 w-4" />
          {t("common.previous")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= lastPage}
          onClick={() => onPageChange(page + 1)}
        >
          {t("common.next")}
          <NextIcon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
