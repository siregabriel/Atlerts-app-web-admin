const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

// ==========================================
// 📢 ROBOT 1: BROADCASTS (✅ Funciona Perfecto)
// ==========================================
exports.notificarBroadcast = functions.firestore
  .document('broadcasts/{broadcastId}')
  .onCreate(async (snap, context) => {
    const datos = snap.data();
    console.log("📢 Nuevo Broadcast:", JSON.stringify(datos));

    if (!datos) return;

    // 1. Preparar contenido
    const contenidoTexto = datos.text || datos.mensaje || "";
    const hayImagen = datos.imageUrl || datos.image || datos.url || datos.foto;
    
    let cuerpoNotificacion = "";
    if (contenidoTexto.length > 0) {
        cuerpoNotificacion = contenidoTexto;
    } else if (hayImagen) {
        cuerpoNotificacion = "📷 New image published.";
    } else {
        cuerpoNotificacion = "New announcement on Atlerts.";
    }

    const tituloNotificacion = datos.senderName || datos.titulo || "Atlas News";

    // 2. MENSAJE CON CONFIGURACIÓN ESPECÍFICA DE APPLE 🍎
    const message = {
      topic: "general",
      notification: {
        title: tituloNotificacion,
        body: cuerpoNotificacion
      },
      // 👇 Obligamos al iPhone a sonar
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
            "content-available": 1
          }
        }
      },
      data: {
        image: hayImagen ? String(hayImagen) : "none",
        click_action: "FLUTTER_NOTIFICATION_CLICK"
      }
    };

    try {
        const response = await admin.messaging().send(message);
        console.log("✅ Broadcast enviado:", response);
        return response;
    } catch (error) {
        console.error("❌ Error broadcast:", error);
        return null;
    }
  });

// ==========================================
// 💬 ROBOT 2: MENSAJES (🔧 AJUSTADO A TUS CHATS)
// ==========================================
exports.notificarMensaje = functions.firestore
  // 👇 CAMBIO IMPORTANTE: Ahora miramos DENTRO de la carpeta de chats
  .document('chats/{chatId}/messages/{msgId}')
  .onCreate(async (snap, context) => {
    const datos = snap.data();
    console.log("💬 Mensaje detectado en chat:", context.params.chatId);
    
    // 1. Buscar destinatario (Probamos todos los nombres posibles para no fallar)
    const destinatarioId = datos.recipientId || datos.toId || datos.receiverId || datos.userTo || datos.toUser;

    if (!destinatarioId) {
        console.log("⚠️ Se detectó mensaje pero no tiene destinatario (recipientId/toId). Datos:", JSON.stringify(datos));
        return null;
    }

    try {
        // 2. Buscar el token del usuario destino
        const userDoc = await db.collection('users').doc(destinatarioId).get();
        const fcmToken = userDoc.data()?.fcmToken;

        if (!fcmToken) {
            console.log(`❌ El usuario ${destinatarioId} no tiene token FCM guardado.`);
            return null;
        }

        // 3. Crear el mensaje Blindado para Apple
        const message = {
          token: fcmToken,
          notification: {
            title: datos.senderName || "New Message",
            body: datos.text || datos.message || datos.content || "You have received a message."
          },
          // 👇 CONFIGURACIÓN APPLE 🍎 (Prioridad Alta)
          apns: {
            payload: {
              aps: {
                sound: "default",
                badge: 1,
                "content-available": 1
              }
            }
          },
          data: {
            type: "chat",
            chatId: context.params.chatId, // Enviamos el ID del chat por si la App lo necesita
            msgId: context.params.msgId
          }
        };

        const response = await admin.messaging().send(message);
        console.log("✅ Mensaje Chat enviado a:", destinatarioId);
        return response;
    } catch (error) {
        console.error("❌ Error enviando mensaje chat:", error);
        return null;
    }
  });

// ==========================================
// ❤️ ROBOT 3: INTERACCIONES (Sin cambios)
// ==========================================
exports.notificarInteraccion = functions.firestore
  .document('interactions/{intId}')
  .onCreate(async (snap, context) => {
    const datos = snap.data();
    const ownerId = datos.postOwnerId;

    if (!ownerId || ownerId === datos.userId) return null;

    try {
        const userDoc = await db.collection('users').doc(ownerId).get();
        const fcmToken = userDoc.data()?.fcmToken;

        if (!fcmToken) return null;

        let titulo = "New activity";
        let cuerpo = "Interaction on your post.";

        if (datos.type === "like") {
            titulo = "❤️ New Like";
            cuerpo = `${datos.userName || "Someone"} liked your post.`;
        } else if (datos.type === "comment") {
            titulo = "💬 New Comment";
            cuerpo = `${datos.userName || "Someone"} commented: ${datos.commentText}`;
        }

        const message = {
          token: fcmToken,
          notification: {
            title: titulo,
            body: cuerpo
          },
          apns: {
            payload: {
              aps: {
                sound: "default",
                badge: 1
              }
            }
          }
        };

        return await admin.messaging().send(message);
    } catch (error) {
        return null;
    }
  });