{{/*
Expand the name of the chart.
*/}}
{{- define "plg.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "plg.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "plg.labels" -}}
helm.sh/chart: {{ include "plg.name" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: plg
{{- end }}

{{/*
Loki labels.
*/}}
{{- define "plg.loki.labels" -}}
{{ include "plg.labels" . }}
app.kubernetes.io/name: loki
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: log-aggregation
{{- end }}

{{/*
Loki selector labels.
*/}}
{{- define "plg.loki.selectorLabels" -}}
app.kubernetes.io/name: loki
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Loki fullname.
*/}}
{{- define "plg.loki.fullname" -}}
{{- printf "%s-loki" (include "plg.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Convert retention days to hours for Loki configuration.
*/}}
{{- define "plg.loki.retentionPeriod" -}}
{{- printf "%dh" (mul .Values.loki.retentionDays 24) }}
{{- end }}
