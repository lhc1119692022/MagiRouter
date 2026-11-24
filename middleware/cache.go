package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
)

// isBrandingAsset reports whether the request targets a site-identity file
// (favicon, launcher icon, web app manifest).
//
// These names rarely change while their bytes do, so a week-long cache leaves
// a rebranded site showing the previous owner's icon in the tab bar long after
// the deploy. They are cheap enough to revalidate on every navigation.
func isBrandingAsset(path string) bool {
	name := path
	if idx := strings.LastIndexByte(name, '/'); idx >= 0 {
		name = name[idx+1:]
	}
	if name == "site.webmanifest" || name == "apple-touch-icon.png" {
		return true
	}
	return strings.HasPrefix(name, "favicon") || strings.HasPrefix(name, "icon-")
}

func Cache() func(c *gin.Context) {
	return func(c *gin.Context) {
		if c.Request.RequestURI == "/" || isBrandingAsset(c.Request.URL.Path) {
			c.Header("Cache-Control", "no-cache")
		} else {
			c.Header("Cache-Control", "max-age=604800") // one week
		}
		c.Header("Cache-Version", "b688f2fb5be447c25e5aa3bd063087a83db32a288bf6a4f35f2d8db310e40b14")
		c.Next()
	}
}
