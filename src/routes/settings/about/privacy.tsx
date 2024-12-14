import type { Component } from "solid-js";
import BasicLayout from "../../../features/Settings/components/BasicLayout";
import { useI18n } from "../../../i18n";
import { locale } from "../../../shared/libs/useLocale";

// see: https://www.google.com/intl/ja/analytics/terms/
const analyticsTerms: Record<string, string> = {
  ja: "https://www.google.com/analytics/terms/jp.html",
  en: "https://www.google.com/analytics/terms/us.html",
  "en-US": "https://www.google.com/analytics/terms/us.html",
  "en-UK": "https://www.google.com/analytics/terms/gb.html",
  fallback: "https://www.google.com/analytics/terms/us.html",
};

const privacy: Component = () => {
  const t = useI18n();

  const analyticsTermsUrl = () =>
    analyticsTerms[locale()] ?? analyticsTerms.fallback;

  return (
    <BasicLayout title={t("settings.privacy.title")} backTo="/settings/about">
      <div class="space-y-4">
        <div class="space-y-2 overflow-hidden">
          <h4 class="flex items-center gap-1 font-500 text-h3">
            {t("settings.privacy.useOfAccessAnalysisTools")}
          </h4>
          <p class="break-anywhere whitespace-pre-wrap">
            {t("settings.privacy.accessAnalysisToolDescription")}
          </p>
          {/* biome-ignore lint/nursery/useSortedClasses: biomeがgroupingに非対応のため */}
          <table class="all-[td]:(b-1 px-2 py-1 max-w-50) all-[th]:(b-1 px-2 py-1) all-[a]-break-words block border-collapse overflow-x-auto break-keep">
            <thead>
              <tr>
                <th>{t("settings.privacy.providerName")}</th>
                <th>{t("settings.privacy.accessAnalysisTool")}</th>
                <th>{t("settings.privacy.termsOfUse")}</th>
                <th>{t("settings.privacy.privacyPolicy")}</th>
                <th>{t("settings.privacy.optOutMethod")}</th>
                <th>{t("settings.privacy.informationProvided")}</th>
                <th>{t("settings.privacy.purposeOfUse")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Google</td>
                <td>Google Analytics</td>
                <td>
                  <a
                    href={analyticsTermsUrl()}
                    class="text-link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {analyticsTermsUrl()}
                  </a>
                </td>
                <td>
                  <a
                    class="text-link"
                    target="_blank"
                    rel="noopener noreferrer"
                    href="https://policies.google.com/privacy"
                  >
                    https://policies.google.com/privacy
                  </a>
                </td>
                <td>
                  <a
                    class="text-link"
                    target="_blank"
                    rel="noopener noreferrer"
                    href="https://tools.google.com/dlpage/gaoptout"
                  >
                    https://tools.google.com/dlpage/gaoptout
                  </a>
                </td>
                <td class="break-keep">
                  {t("settings.privacy.gaInformationProvided")}
                </td>

                <td>{t("settings.privacy.gaPurposeOfUse")}</td>
              </tr>
              <tr>
                <td>Functional Software, Inc</td>
                <td>Sentry</td>
                <td>
                  <a
                    href="https://sentry.io/terms/"
                    class="text-link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    https://sentry.io/terms/
                  </a>
                </td>
                <td>
                  <a
                    class="text-link"
                    target="_blank"
                    rel="noopener noreferrer"
                    href="https://sentry.io/privacy/"
                  >
                    https://sentry.io/privacy/
                  </a>
                </td>
                <td>-</td>
                <td>{t("settings.privacy.sentryInformationProvided")}</td>
                <td>{t("settings.privacy.sentryPurposeOfUse")}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </BasicLayout>
  );
};

export default privacy;
