use lettre;
use lettre::transport::smtp::SmtpTransportBuilder;
use config;

pub fn create_mailer
    (reuse: bool)
     -> Result<lettre::transport::smtp::SmtpTransport, lettre::transport::smtp::error::Error> {
    match SmtpTransportBuilder::new((config::MAIL_SERVER, config::MAIL_PORT)) {
        Ok(x) => {
            let mailer = if config::MAIL_USER.len() > 0 && config::MAIL_PASSWORD.len() > 0 {
                x.credentials(config::MAIL_USER, config::MAIL_PASSWORD)
                    .ssl_wrapper()
            } else {
                x
            };
            Ok(if reuse {
                    mailer.connection_reuse(true)
                } else {
                    mailer
                }
                .build())
        }
        Err(e) => Err(e),
    }
}
