-- Regras reutilizadas por varios modelos. Ficam aqui para existir um lugar so.

-- Canal a partir de utm_source/utm_medium (ou session_source/medium do GA4).
-- NULL quando nao ha UTM: quem chama decide se isso vira organico.
CREATE OR REPLACE MACRO channel_from_utm(src, med) AS
  CASE
    WHEN src IS NULL AND med IS NULL THEN NULL
    WHEN lower(med) IN ('cpc', 'ppc', 'paid', 'paid_social', 'paidsocial', 'paid-social', 'display', 'video')
      THEN CASE
        WHEN lower(src) IN ('facebook', 'instagram', 'meta', 'fb', 'ig', 'an', 'messenger') THEN 'meta'
        WHEN lower(src) IN ('google', 'youtube', 'adwords') THEN 'google_ads'
        WHEN lower(src) IN ('tiktok', 'tt') THEN 'tiktok'
        ELSE 'organic'
      END
    ELSE 'organic'
  END;

-- Ultimo clique: click id ganha da UTM, UTM ganha de nada.
CREATE OR REPLACE MACRO attributed_channel(gclid, fbclid, ttclid, src, med) AS
  CASE
    WHEN gclid IS NOT NULL THEN 'google_ads'
    WHEN fbclid IS NOT NULL THEN 'meta'
    WHEN ttclid IS NOT NULL THEN 'tiktok'
    ELSE coalesce(channel_from_utm(src, med), 'organic')
  END;

CREATE OR REPLACE MACRO attribution_method(gclid, fbclid, ttclid, campaign) AS
  CASE
    WHEN gclid IS NOT NULL THEN 'gclid'
    WHEN fbclid IS NOT NULL THEN 'fbclid'
    WHEN ttclid IS NOT NULL THEN 'ttclid'
    WHEN campaign IS NOT NULL THEN 'utm'
    ELSE 'sem_origem'
  END;

-- Numero em formato brasileiro vindo da planilha: "R$ 22.000,00" -> 22000.0
CREATE OR REPLACE MACRO parse_brl(txt) AS
  TRY_CAST(replace(replace(regexp_replace(trim(txt), '[R$\s]', '', 'g'), '.', ''), ',', '.') AS DOUBLE);

CREATE OR REPLACE MACRO norm_text(txt) AS
  trim(regexp_replace(lower(strip_accents(txt)), '[^a-z0-9]+', ' ', 'g'));

-- Timestamp do contrato (ISO com fuso) para hora local de Sao Paulo.
CREATE OR REPLACE MACRO local_ts(txt) AS
  timezone('America/Sao_Paulo', CAST(txt AS TIMESTAMPTZ));
