async function removeCardProperty() {
    for (const card of transitionCards) {
        await functions.giveCardTo(card)
    }
    await functions.repositionCards()
}