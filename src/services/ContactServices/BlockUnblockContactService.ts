import AppError from "../../errors/AppError";
import Contact from "../../models/Contact";
import { sessionManager } from "../../libs/wbot/SessionManager";
import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import logger from "../../utils/logger";

interface Request {
    contactId: string;
    companyId: string | number;
    active: boolean
}

function formatBRNumber(jid: string) {
    const regexp = new RegExp(/^(\d{2})(\d{2})\d{1}(\d{8})$/);
    if (regexp.test(jid)) {
        const match = regexp.exec(jid);
        if (match && match[1] === '55' && Number.isInteger(Number.parseInt(match[2]))) {
            const ddd = Number.parseInt(match[2]);
            if (ddd < 31) {
                return match[0];
            } else if (ddd >= 31) {
                return match[1] + match[2] + match[3];
            }
        }
    } else {
        return jid;
    }
}

function createJid(number: string) {
    if (number.includes('@g.us') || number.includes('@s.whatsapp.net')) {
        return formatBRNumber(number) as string;
    }
    return number.includes('-')
        ? `${number}@g.us`
        : `${formatBRNumber(number)}@s.whatsapp.net`;
}

const BlockUnblockContactService = async ({
    contactId,
    companyId,
    active
}: Request): Promise<Contact> => {
    const contact = await Contact.findByPk(contactId);

    if (!contact) {
        throw new AppError("ERR_NO_CONTACT_FOUND", 404);
    }

    const blockStatus       = active ? "unblock" : "block";
    const blockAction       = active ? "desbloquear" : "bloquear";
    const blockUpdateState  = active;
    const errorMessage = active ? "ERR_CANNOT_UNBLOCK_CONTACT" : "ERR_CANNOT_BLOCK_CONTACT";

    try {
        const whatsappCompany = await GetDefaultWhatsApp(Number(companyId))

        const wbot = sessionManager.getSession(whatsappCompany.id).getSession();

        const jid = createJid(contact.number);

        await wbot.updateBlockStatus(jid, blockStatus);

        await contact.update({ active: blockUpdateState });

    } catch (error) {
        logger.error(`Error al ${blockAction} el contacto: ${error}`);
        throw new AppError(errorMessage, 500);
    }


    return contact;
};

export default BlockUnblockContactService;
