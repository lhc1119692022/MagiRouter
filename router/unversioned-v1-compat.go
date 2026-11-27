package router

import (
	"net/http"
	"net/url"
	"strings"
)

func WrapUnversionedV1Handler(next http.Handler) http.Handler {
	if next == nil {
		return http.NotFoundHandler()
	}
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		rewrittenPath, shouldRewrite := resolveUnversionedV1Path(request)
		if !shouldRewrite {
			next.ServeHTTP(writer, request)
			return
		}
		clonedRequest := new(http.Request)
		*clonedRequest = *request
		clonedURL := new(url.URL)
		*clonedURL = *request.URL
		clonedURL.Path = rewrittenPath
		if clonedURL.RawPath != "" {
			if rewrittenPath == "/v1"+request.URL.Path {
				clonedURL.RawPath = "/v1" + clonedURL.RawPath
			} else {
				clonedURL.RawPath = ""
			}
		}
		clonedRequest.URL = clonedURL
		clonedRequest.RequestURI = clonedURL.RequestURI()
		next.ServeHTTP(writer, clonedRequest)
	})
}

func resolveUnversionedV1Path(request *http.Request) (string, bool) {
	if request == nil || request.URL == nil {
		return "", false
	}
	requestPath := request.URL.Path
	if !strings.HasPrefix(requestPath, "/") || requestPath == "/" {
		return "", false
	}
	if containsDotPathSegment(requestPath) || containsDotPathSegment(request.URL.RawPath) {
		return "", false
	}

	trimmedPath := requestPath
	if withoutSlash, hasTrailingSlash := strings.CutSuffix(requestPath, "/"); hasTrailingSlash && withoutSlash != "" && !strings.HasSuffix(withoutSlash, "/") {
		trimmedPath = withoutSlash
	}

	method := request.Method
	switch {
	case trimmedPath == "/responses":
		if method == http.MethodPost || method == http.MethodGet || method == http.MethodOptions {
			return "/v1/responses", true
		}
	case trimmedPath == "/responses/compact":
		if method == http.MethodPost || method == http.MethodOptions {
			return "/v1/responses/compact", true
		}
	case strings.HasPrefix(requestPath, "/responses/") && len(requestPath) > len("/responses/"):
		if method == http.MethodGet || method == http.MethodPost || method == http.MethodDelete || method == http.MethodOptions {
			return "/v1" + requestPath, true
		}
	case trimmedPath == "/chat/completions",
		trimmedPath == "/completions",
		trimmedPath == "/embeddings",
		trimmedPath == "/moderations",
		trimmedPath == "/rerank",
		trimmedPath == "/edits",
		trimmedPath == "/alpha/search",
		trimmedPath == "/tools/search",
		trimmedPath == "/tools/fetch",
		trimmedPath == "/images/generations",
		trimmedPath == "/images/edits",
		trimmedPath == "/images/variations",
		trimmedPath == "/audio/transcriptions",
		trimmedPath == "/audio/translations",
		trimmedPath == "/audio/speech",
		trimmedPath == "/video/generations":
		if method == http.MethodPost || method == http.MethodOptions {
			return "/v1" + trimmedPath, true
		}
	case trimmedPath == "/messages":
		if method == http.MethodPost || method == http.MethodOptions {
			return "/v1/messages", true
		}
	case strings.HasPrefix(requestPath, "/messages/") && len(requestPath) > len("/messages/"):
		if method == http.MethodPost || method == http.MethodOptions {
			return "/v1" + requestPath, true
		}
	case trimmedPath == "/realtime":
		if method == http.MethodGet || method == http.MethodOptions {
			return "/v1/realtime", true
		}
	case strings.HasPrefix(requestPath, "/engines/"):
		rest, _ := strings.CutPrefix(trimmedPath, "/engines/")
		modelSegment, hasSuffix := strings.CutSuffix(rest, "/embeddings")
		if hasSuffix && modelSegment != "" && !strings.Contains(modelSegment, "/") && (method == http.MethodPost || method == http.MethodOptions) {
			return "/v1" + trimmedPath, true
		}
	case trimmedPath == "/videos":
		if method == http.MethodPost || method == http.MethodOptions {
			return "/v1/videos", true
		}
	case strings.HasPrefix(requestPath, "/videos/") && len(requestPath) > len("/videos/"):
		if method == http.MethodGet || method == http.MethodHead || method == http.MethodPost || method == http.MethodDelete || method == http.MethodOptions {
			return "/v1" + requestPath, true
		}
	case strings.HasPrefix(requestPath, "/video/generations/") && len(requestPath) > len("/video/generations/"):
		if method == http.MethodGet || method == http.MethodOptions {
			return "/v1" + requestPath, true
		}
	case strings.HasPrefix(requestPath, "/tasks/") && len(requestPath) > len("/tasks/"):
		if method == http.MethodPost || method == http.MethodGet || method == http.MethodHead || method == http.MethodOptions {
			return "/v1" + requestPath, true
		}
	case trimmedPath == "/files":
		if method == http.MethodGet || method == http.MethodPost || method == http.MethodOptions {
			return "/v1/files", true
		}
	case strings.HasPrefix(requestPath, "/files/") && len(requestPath) > len("/files/"):
		if method == http.MethodGet || method == http.MethodPost || method == http.MethodDelete || method == http.MethodOptions {
			return "/v1" + requestPath, true
		}
	case trimmedPath == "/fine-tunes":
		if method == http.MethodGet || method == http.MethodPost || method == http.MethodOptions {
			return "/v1/fine-tunes", true
		}
	case strings.HasPrefix(requestPath, "/fine-tunes/") && len(requestPath) > len("/fine-tunes/"):
		if method == http.MethodGet || method == http.MethodPost || method == http.MethodOptions {
			return "/v1" + requestPath, true
		}
	case trimmedPath == "/models":
		if method == http.MethodOptions || (method == http.MethodGet && isModelsAPIRequest(request)) {
			return "/v1/models", true
		}
	case strings.HasPrefix(requestPath, "/models/") && len(requestPath) > len("/models/"):
		switch method {
		case http.MethodPost, http.MethodDelete, http.MethodOptions:
			return "/v1" + requestPath, true
		case http.MethodGet:
			if isModelsAPIRequest(request) {
				return "/v1" + requestPath, true
			}
		}
	}

	return "", false
}

func isModelsAPIRequest(request *http.Request) bool {
	if strings.TrimSpace(request.Header.Get("Authorization")) != "" ||
		strings.TrimSpace(request.Header.Get("x-api-key")) != "" ||
		strings.TrimSpace(request.Header.Get("x-goog-api-key")) != "" ||
		strings.TrimSpace(request.Header.Get("anthropic-version")) != "" ||
		strings.TrimSpace(request.URL.Query().Get("key")) != "" {
		return true
	}
	if strings.EqualFold(request.Header.Get("Sec-Fetch-Mode"), "navigate") ||
		strings.EqualFold(request.Header.Get("Sec-Fetch-Dest"), "document") {
		return false
	}
	acceptHeader := strings.ToLower(request.Header.Get("Accept"))
	return !strings.Contains(acceptHeader, "text/html") && !strings.Contains(acceptHeader, "application/xhtml+xml")
}

func containsDotPathSegment(path string) bool {
	if path == "" {
		return false
	}
	for segment := range strings.SplitSeq(path, "/") {
		switch strings.ToLower(segment) {
		case ".", "..", "%2e", "%2e%2e", ".%2e", "%2e.":
			return true
		}
	}
	return false
}
