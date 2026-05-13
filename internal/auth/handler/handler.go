package handler

import (
	"mal/internal/domain"
	"mal/internal/server"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	svc domain.AuthService
}

func NewAuthHandler(svc domain.AuthService) *AuthHandler {
	return &AuthHandler{svc: svc}
}

func (h *AuthHandler) Register(r *gin.Engine) {
	r.GET("/login", h.HandleLoginPage)
	r.POST("/login", h.HandleLogin)
	r.GET("/logout", h.HandleLogout)
}

func (h *AuthHandler) HandleLoginPage(c *gin.Context) {
	c.HTML(http.StatusOK, "login.gohtml", gin.H{
		"CurrentPath": "/login",
	})
}

func (h *AuthHandler) HandleLogin(c *gin.Context) {
	username := c.PostForm("username")
	password := c.PostForm("password")

	session, err := h.svc.Login(c.Request.Context(), username, password)
	if err != nil {
		c.HTML(http.StatusUnauthorized, "login.gohtml", gin.H{
			"Error":       "Invalid username or password",
			"CurrentPath": "/login",
		})
		return
	}

	c.SetCookie("session_id", session.ID, int(24*time.Hour.Seconds()), "/", "", false, true)
	c.Header("HX-Redirect", "/")
	c.Redirect(http.StatusSeeOther, "/")
}

func (h *AuthHandler) HandleLogout(c *gin.Context) {
	sessionID, err := c.Cookie("session_id")
	if err == nil {
		_ = h.svc.Logout(c.Request.Context(), sessionID)
	}

	c.SetCookie("session_id", "", -1, "/", "", false, true)
	c.Redirect(http.StatusSeeOther, "/login")
}
