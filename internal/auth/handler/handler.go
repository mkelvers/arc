package handler

import (
	"mal/internal/domain"
	"net/http"

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
	r.POST("/api/auth/login", h.HandleAPILogin)
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

	c.SetCookie("session_id", session.ID, int(domain.SessionLifetime.Seconds()), "/", "", false, true)
	if c.GetHeader("HX-Request") == "true" {
		c.Header("HX-Redirect", "/")
		c.Status(http.StatusOK)
		return
	}
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

func (h *AuthHandler) HandleAPILogin(c *gin.Context) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
		Name     string `json:"name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Username == "" || body.Password == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	token, user, err := h.svc.LoginForAPIToken(c.Request.Context(), body.Username, body.Password, body.Name)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid username or password"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": gin.H{
			"id":       user.ID,
			"username": user.Username,
			"avatarUrl": func() string {
				if user.AvatarUrl == "" {
					return ""
				}
				return user.AvatarUrl
			}(),
		},
	})
}
