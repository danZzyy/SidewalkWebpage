package controllers

import javax.inject.Inject

import com.mohiva.play.silhouette.api.{ Environment, LogoutEvent, Silhouette }
import com.mohiva.play.silhouette.impl.authenticators.SessionAuthenticator
import models.User
import controllers.headers.ProvidesHeader
import models.audit.{NewTask, AuditTaskTable}
import play.api.libs.json.Json
import play.api.mvc.{BodyParsers, Result, RequestHeader}

import scala.concurrent.Future


/**
 * The basic application controller.
 *
 * @param env The Silhouette environment.
 */
class ApplicationController @Inject() (implicit val env: Environment[User, SessionAuthenticator])
  extends Silhouette[User, SessionAuthenticator] with ProvidesHeader {

  def index = UserAwareAction.async { implicit request =>
    request.identity match {
      case Some(user) =>Future.successful(Ok(views.html.index.indexSignedIn("Project Sidewalk", user)))
      case None => Future.successful(Ok(views.html.index.indexSignedOut("Project Sidewalk")))
    }
  }

  def about = UserAwareAction.async { implicit request =>
    request.identity match {
      case Some(user) =>Future.successful(Ok(views.html.about.aboutSignedIn("Project Sidewalk - About", user)))
      case None => Future.successful(Ok(views.html.about.aboutSignedOut("Project Sidewalk - About")))
    }
  }

  def audit = UserAwareAction.async { implicit request =>
    request.identity match {
      case Some(user) => {
        val task: NewTask = AuditTaskTable.getNewTask(user.username)
        Future.successful(Ok(views.html.audit.auditSignedIn("Project Sidewalk - Audit", user, task)))
      }
      case None => {
        val task: NewTask = AuditTaskTable.getNewTask
        Future.successful(Ok(views.html.audit.auditSignedOut("Project Sidewalk - Audit", task)))
      }
    }
  }

  def test = UserAwareAction.async { implicit request =>
    request.identity match {
      case Some(user) => Future.successful(Ok(Json.obj("user" -> user.username)))
      case None => Future.successful(Ok(Json.obj("message" -> "you are not logged! Login man!")))
    }
  }

}
